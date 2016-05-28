/* eslint-disable no-param-reassign */
import { Observable } from 'rxjs/Observable';
// In real life I'll use just `import { Observable } from 'rxjs/Rx';`
// BTW it's interesting to compare size of library with and without theese imports
import 'rxjs/add/observable/from';
import 'rxjs/add/observable/of';
import 'rxjs/add/observable/empty';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/scan';
import 'rxjs/add/operator/delay';
import 'rxjs/add/operator/concat';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/takeUntil';
import 'rxjs/add/operator/do';

import {
  FETCH_DATA, FETCH_CLEAR_CACHE,
  LOADING_START, LOADING_END, LOADING_CANCEL,
} from './ActionTypes';


/**
* redux-observable process to support data fetching, caching, pre and post loading events.
* input: `{ fetch: (...args: Array<any>) => Observable<any> }`
*
* For each action with type `FETCH_DATA`, like this
* `fetchDataAction = {
*   type: FETCH_DATA,
*   meta: { type: ON_FETCH_SOMETHING_COMPLETE, cache: false },
*   payload: [1, 2]
* }`
*
* It dispatches `LOADING_START` and `LOADING_END` actions before data fetch starts and after it end.
*
* On fetch complete it dispatches action
* `{ type: fetchDataAction.meta.type, payload: fetchResult, meta: fetchDataAction.meta }`
*  and on fetch error
* `{ type: fetchDataAction.meta.type, payload: error, error: true, meta: fetchDataAction.meta }`
*
* If `FETCH_DATA` action meta has `cache: false` property, and action with same
* `payload` and `meta.type` has already been successfully processed,
* it does nothing (_as data is already in redux store_).
* And it `fetch` again if there where fetch error.
*
* If `FETCH_DATA` action meta has `cache: true` property, it always fetch `data` again,
* cancelling previous `FETCH_DATA` action with same `payload` and `meta.type`.
* If such actions are called simultaneously first action does not run at all,
* If sequentially action LOADING_CANCEL will be run
* Look at tests for examples.
*/
export default (services) =>
(actions$, { dispatch }) => {
  const prepared$ = actions$
    // filter only needed events
    .filter(({ type }) => type === FETCH_DATA || type === FETCH_CLEAR_CACHE)
    // precalculate dataKey as it will be used in multiple places
    .map((action) => ({
      ...action,
      dataKey: JSON.stringify([action.meta.type, ...action.payload]),
    }))
    // to simplify logic split action on two if we need to refetch item
    // as refetch is the same as fetch after cache clean
    .mergeMap(action => action.meta.cache
      ? Observable.of(action)
      : Observable.from([
        { ...action, type: FETCH_CLEAR_CACHE },
        action,
      ])
    );

  return prepared$
    // hold information wich items is fetched already
    .scan(
      (r, action) => {
        r.action = undefined;
        if (action.type === FETCH_CLEAR_CACHE) {
          delete r[action.dataKey];
        } else if (!(action.dataKey in r)) {
          r[action.dataKey] = 1;
          r.action = action; // recall this action
        }
        return r;
      },
      {}
    )
    .filter(({ action }) => action !== undefined)
    // if action is not undefined we should to refetch item
    .mergeMap(({ action }) =>
      Observable.of({})
        .delay(0) // to allow not run first fetch if same actions run simultaneously
        .takeUntil(
          prepared$
            .filter(({ type, dataKey: key }) =>
              type === FETCH_CLEAR_CACHE && key === action.dataKey
            )
        )
        .mergeMap(() =>
          Observable.of({ type: LOADING_START, payload: action.payload, meta: action.meta })
            .concat(
              (services[action.meta.api] || services)(...action.payload)
              .map(payload => ({ type: action.meta.type, payload, meta: action.meta }))
              .catch(error => Observable.of({
                type: action.meta.type, payload: error, error: true, meta: action.meta,
              }))
              .do(({ error }) => {
                if (error === true) {
                  // run dispatch at next step to allow error and LOADING_END actions to
                  // finish process
                  Observable.of({ ...action, type: FETCH_CLEAR_CACHE })
                    .delay(0)
                    .subscribe(dispatch);
                }
              })
            )
            .concat(
              Observable.of({ type: LOADING_END, payload: action.payload, meta: action.meta })
            )
            // we should stop sequence if FETCH_CLEAR_CACHE occured (the second action wins)
            .takeUntil(
              prepared$
                .filter(({ type, dataKey: key }) =>
                  type === FETCH_CLEAR_CACHE && key === action.dataKey
                )
                .do(() => dispatch({
                  type: LOADING_CANCEL, payload: action.payload, meta: action.meta,
                }))
            )
      )
    );
};
