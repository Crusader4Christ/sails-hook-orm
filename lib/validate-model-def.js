/**
 * Module dependencies
 */

var util = require('util');
var _ = require('lodash');
var modelHasNoDatastoreError = require('../constants/model-has-no-datastore.error');
var modelHasMultipleDatastoresError = require('../constants/model-has-multiple-datastores.error');
var constructError = require('./construct-error');




/**
 * validateModelDef()
 *
 * Validate, normalize, and mix in implicit defaults for a particular model
 * definition.  Includes adjustments for backwards compatibility.
 *
 * @required {Dictionary} originalModelDef
 * @required {String} modelIdentity
 * @required {Dictionary} hook
 * @required {SailsApp} sails
 *
 * @returns {Dictionary} [normalized model definition]
 * @throws {Error} E_MODEL_HAS_MULTIPLE_DATASTORES
 * @throws {Error} E_MODEL_HAS_NO_DATASTORE
 */

module.exports = function validateModelDef (originalModelDef, modelIdentity, hook, sails) {

  // Rebuild model definition to provide a layer of insulation against any
  // changes that might tamper with the original, raw definition.
  //
  // Model settings are determined using the following rules:
  // (in descending order of precedence)
  // • explicit model def
  // • sails.config.models
  // • implicit framework defaults
  var normalizedModelDef;

  // We start off with some implicit defaults:
  normalizedModelDef = {
    // Set `identity` so it is available on the model itself.
    identity: modelIdentity,
    // Default the table name to the identity.
    tableName: modelIdentity,
    // Default attributes to an empty dictionary (`{}`).
    // > Note that we handle merging attributes as a special case below
    // > (i.e. because we're doing a shallow `.extend()` rather than a deep merge)
    // > This allows app-wide defaults to include attributes that will be shared across
    // > all models.
    attributes: {}
  };

  // Check for any instance methods in use. If there are any, log a deprecation
  // warning alerting users that they will be removed in the future.
  _.each(originalModelDef.attributes, function deprecateInstanceMethods(val, attributeName) {
    // Always ignore `toJSON` for now.
    if (attributeName === 'toJSON') {
      return;
    }

    // If the attribute is a function, log a message
    if (_.isFunction(val)) {
      sails.log.debug('It looks like you are using an instance method (`' + attributeName + '`) defined on the `' + originalModelDef.globalId + '` model.');
      sails.log.debug('Model instance methods are deprecated in Sails v1, and support will be removed.');
      sails.log.debug('Please refactor the logic from this instance method into a static method model method or helper.');
    }
  });

  // Next, merge in app-wide defaults.
  _.extend(normalizedModelDef, _.omit(sails.config.models, ['attributes']));
  // Merge in attributes from app-wide defaults, if there are any.
  if (!_.isFunction(sails.config.models.attributes) && !_.isArray(sails.config.models.attributes) && _.isObject(sails.config.models.attributes)) {
    normalizedModelDef.attributes = _.extend(normalizedModelDef.attributes, sails.config.models.attributes);
  }

  // Finally, fold in the original properties provided in the userland model definition.
  _.extend(normalizedModelDef, _.omit(originalModelDef, ['attributes']));
  // Merge in attributes from the original model def, if there are any.
  if (!_.isFunction(originalModelDef.attributes) && !_.isArray(originalModelDef.attributes) && _.isObject(originalModelDef.attributes)) {
    normalizedModelDef.attributes = _.extend(normalizedModelDef.attributes, originalModelDef.attributes);
  }

  // Move certain attribute properties into `autoMigrations`.
  _.each(normalizedModelDef.attributes, function moveAutomigrationProperties (val, attributeName) {
    var PROPS_TO_AUTOMIGRATE = ['autoIncrement', 'autoCreatedAt', 'autoUpdatedAt'];
    _.each(PROPS_TO_AUTOMIGRATE, function(property) {
      if (!_.isUndefined(val[property])) {
        val.autoMigrations = val.autoMigrations || {};
        val.autoMigrations[property] = val[property];
        delete val[property];
      }
    });
  });



  // If this is production, force `migrate: safe`!!
  // (note that we check `sails.config.environment` and process.env.NODE_ENV
  //  just to be on the conservative side)
  if ( normalizedModelDef.migrate !== 'safe' && (sails.config.environment === 'production' || process.env.NODE_ENV === 'production')) {
    normalizedModelDef.migrate = 'safe';
    sails.log.verbose('For `%s` model, forcing Waterline to use `migrate: "safe" strategy (since this is production)', modelIdentity);
  }



  // Now that we have a normalized model definition, verify that a valid datastore setting is present:
  // (note that much of the stuff below about arrays is for backwards-compatibility)

  // If a datastore is not configured in our normalized model def (i.e. it is falsy or an empty array), then we throw a fatal error.
  if (!normalizedModelDef.datastore || _.isEqual(normalizedModelDef.datastore, [])) {
    throw constructError(modelHasNoDatastoreError, { modelIdentity: modelIdentity });
  }
  // Coerce `Model.datastore` to an array.
  // (note that future versions of Sails may skip this step and keep it as a string instead of an array)
  if (!_.isArray(normalizedModelDef.datastore)) {
    normalizedModelDef.datastore = [
      normalizedModelDef.datastore
    ];
  }
  // Explicitly prevent more than one datastore from being used.
  if (normalizedModelDef.datastore.length > 1) {
    throw constructError(modelHasMultipleDatastoresError, { modelIdentity: modelIdentity });
  }

  // Grab the normalized configuration for the datastore referenced by this model.
  // If the normalized model def doesn't have a `schema` flag, then check out its
  // normalized datastore config to see if _it_ has a `schema` setting.
  //
  // > Usually this is a default coming from the adapter itself-- for example,
  // > `sails-mongo` and `sails-disk` set `schema: false` by default, whereas
  // > `sails-mysql` and `sails-postgresql` default to `schema: true`.
  // > See `lib/validate-datastore-config.js` to see how that stuff gets in there.
  var referencedDatastore = hook.datastores[normalizedModelDef.datastore[0]];
  if (!_.isObject(referencedDatastore)) {
    throw new Error('Consistency violation: A model (`'+modelIdentity+'`) references a datastore which cannot be found (`'+normalizedModelDef.datastore[0]+'`).  If this model definition has an explicit `datastore` property, check that it is spelled correctly.  If not, check your default `datastore` (usually located in `config/models.js`).  Finally, check that this datastore (`'+normalizedModelDef.datastore[0]+'`) is valid as per http://sailsjs.com/docs/reference/configuration/sails-config-datastores.');
  }
  var normalizedDatastoreConfig = referencedDatastore.internalConfig;
  if (_.isUndefined(normalizedModelDef.schema)) {
    if (!_.isUndefined(normalizedDatastoreConfig.schema)) {
      normalizedModelDef.schema = normalizedDatastoreConfig.schema;
    }
  }

  // Return the normalized model definition.
  return normalizedModelDef;

};
