/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var helpSendNativeQuery = require('./help-send-native-query');


/**
 * Send a WLQL "statement" (stage 4 query) to the database and return the results.
 *
 * > This utility is for a datastore (RDI) method.  Before attempting to use this,
 * > the datastore method should guarantee that the adapter (via its driver) actually
 * > supports all the necessary pieces.
 *
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Dictionary} options
 *         @required {Ref} manager
 *         @required {Ref} driver
 *         @required {Dictionary} statement
 *         @optional {Dictionary} meta
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Function} done
 *         @param {Error?} err
 *         @param {JSON} parsedResult
 */
module.exports = function helpSendStatement(options, done){

  //  ╔═╗╦  ╔═╗╔═╗╔═╗╦╔═╗╦ ╦  ┌─┐┌┬┐┌─┐┌┬┐┌─┐┌┬┐┌─┐┌┐┌┌┬┐
  //  ║  ║  ╠═╣╚═╗╚═╗║╠╣ ╚╦╝  └─┐ │ ├─┤ │ ├┤ │││├┤ │││ │
  //  ╚═╝╩═╝╩ ╩╚═╝╚═╝╩╚   ╩   └─┘ ┴ ┴ ┴ ┴ └─┘┴ ┴└─┘┘└┘ ┴
  // Examine the statement to figure out its "query type".
  // (This is used below when we parse the raw result returned from the compiled native query.)
  //
  // > If the statement cannot be identified as any recognized "query type", then
  // > we'll bail with an error. (Besides providing important information we need below,
  // > this step is also a sanity check that ensures the baseline sanity of the provided
  // > statement before attempting to pass it in to the driver's `.compileStatement()`
  // > method.)
  // >
  // > For full list of query types, see:
  // >  • https://github.com/treelinehq/waterline-query-docs/blob/8f0228cbb05fca72693cc2cb3747e05593b8063c/docs/results.md
  //
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // FUTURE: Since it's generic and would be helpful to use from adapters as well,
  // extrapolate this logic into wl-utils.
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  var queryType;
  if (_.has(options.statement, 'select')) {
    queryType = 'select';
  }
  else if (_.has(options.statement, 'insert')) {
    queryType = 'insert';
  }
  else if (_.has(options.statement, 'update')) {
    queryType = 'update';
  }
  else if (_.has(options.statement, 'del')) {
    // Notice that these don't all follow exactly the same pattern!
    queryType = 'delete';
  }
  else if (_.has(options.statement, 'count')) {
    queryType = 'count';
  }
  else if (_.has(options.statement, 'sum')) {
    queryType = 'sum';
  }
  else if (_.has(options.statement, 'avg')) {
    queryType = 'avg';
  }
  else {
    return done(new Error(
      'This statement cannot be classified.  More specifically, it does not '+
      'match any recognizable "query type"; meaning it is probably not valid.\n'+
      'See WLQL docs, or for additional help, visit http://sailsjs.com/support.'
    ));
  }//>-•

  // TODO: remove commented-out logs
  // console.log('queryType',queryType);


  //  ╔═╗╔═╗╔╦╗╔═╗╦╦  ╔═╗  ┌─┐┌┬┐┌─┐┌┬┐┌─┐┌┬┐┌─┐┌┐┌┌┬┐
  //  ║  ║ ║║║║╠═╝║║  ║╣   └─┐ │ ├─┤ │ ├┤ │││├┤ │││ │
  //  ╚═╝╚═╝╩ ╩╩  ╩╩═╝╚═╝  └─┘ ┴ ┴ ┴ ┴ └─┘┴ ┴└─┘┘└┘ ┴
  // Attempt to build a native query from the provided WLQL statement.
  // (Note that `compiledStatementReport.meta` is ignored)
  //
  // > More info:
  // > • https://github.com/treelinehq/waterline-query-docs
  var compiledStatementReport;
  try {
    compiledStatementReport = options.driver.compileStatement({
      statement: options.statement,
      meta: options.meta
    }).execSync();
  } catch (e) {
    switch (e.code) {
      case 'malformed': return done(e.output.error);
      case 'notSupported': return done(e.output.error);
      default: return done(e);
    }
  }


  //  ╔═╗╔═╗╔╗╔╔╦╗  ┌┐┌┌─┐┌┬┐┬┬  ┬┌─┐  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
  //  ╚═╗║╣ ║║║ ║║  │││├─┤ │ │└┐┌┘├┤   │─┼┐│ │├┤ ├┬┘└┬┘
  //  ╚═╝╚═╝╝╚╝═╩╝  ┘└┘┴ ┴ ┴ ┴ └┘ └─┘  └─┘└└─┘└─┘┴└─ ┴
  // Send the compiled native query to the database.
  helpSendNativeQuery({
    manager: options.manager,
    driver: options.driver,
    nativeQuery: compiledStatementReport.nativeQuery,
    meta: options.meta,
  }, function (err, rawResult) {
    if (err) {
      return done(err);
    }

    //  ╔═╗╔═╗╦═╗╔═╗╔═╗  ┌┐┌┌─┐┌┬┐┬┬  ┬┌─┐  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬  ┬─┐┌─┐┌─┐┬ ┬┬ ┌┬┐
    //  ╠═╝╠═╣╠╦╝╚═╗║╣   │││├─┤ │ │└┐┌┘├┤   │─┼┐│ │├┤ ├┬┘└┬┘  ├┬┘├┤ └─┐│ ││  │
    //  ╩  ╩ ╩╩╚═╚═╝╚═╝  ┘└┘┴ ┴ ┴ ┴ └┘ └─┘  └─┘└└─┘└─┘┴└─ ┴   ┴└─└─┘└─┘└─┘┴─┘┴
    // Parse the raw result from the native query.
    //
    // > More info:
    // > • https://github.com/node-machine/driver-interface/blob/386b5691806164f1d429fac54b84db97a978d601/machines/parse-native-query-result.js
    // > • https://github.com/treelinehq/waterline-query-docs/blob/8f0228cbb05fca72693cc2cb3747e05593b8063c/docs/results.md
    var resultParsingReport;
    try {
      resultParsingReport = options.driver.parseNativeQueryResult({
        queryType: queryType,
        nativeQueryResult: rawResult
      }).execSync();
    } catch (e) {
      return done(new Error(
        'Attempting to parse the raw result from this native query resulted in an unexpected error:\n'+
        '```\n'+
        e.stack+'\n'+
        '```\n'+
        'Here is the raw result that caused the error:\n'+
        util.inspect(rawResult, {depth: 5})+'\n'+
        '```'
      ));
    }//</catch>  >-•

    // TODO: remove commented-out logs
    // console.log('raw result:',rawResult);
    // console.log('resultParsingReport:',resultParsingReport);

    // > (Note that `resultParsingReport.meta` is ignored)
    return done(undefined, resultParsingReport.result);

  });//</callback from helpSendNativeQuery()>

};


// To test:
// ```
// User.getDatastore().sendStatement({ avg: 'luckyNumber', from: 'user', where: { id: 1 } }).exec(function _afterwards(){if (arguments[0]) { console.log('ERROR:', arguments[0]); return; } console.log('Ok.  Result:',arguments[1]);  });
// ```

