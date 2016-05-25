# redux-observable-process-fetch

This library is a [redux-observable](https://github.com/redux-observable/redux-observable) middleware.
And as `redux-observable` is a middleware itself it is a middleware for middleware.

This middleware add caching, refetching, pre and post loading actions support
for async data loading services like `Observable.ajax` or any other service with signature
`(...args: Array<any>) => Observable<any>`.

# Example

The best example is a [tests](./tests/createFetchProcess.spec.js)

Initialize redux with `redux-observable` and `redux-observable-process-fetch`

```javascript
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/dom/ajax';
import { createStore, applyMiddleware } from 'redux';
import { reduxObservable, combineDelegators } from 'redux-observable';
import { createFetchProcess } from 'redux-observable-process-fetch';

const ctreateStoreWithReduxObservableMiddleware = (reducer) => {
  const processor = combineDelegators(
    createFetchProcess({ fetch: (type, id) => Observable.ajax(`http://blbla/${type}/${id}`) })
  );
  const middleware = reduxObservable(processor);
  const store = createStore(reducer, applyMiddleware(middleware));
  return store;
};
```

Create action creator

```javascript
export const loadMySuperObject = (...args) => ({
  type: FETCH_DATA,
  meta: { type: 'SUPER_OBJECT_LOAD', cache: true },
  payload: args,
});
```

Use `loadMySuperObject` as usual in redux.

# What you will get

For each action with type `FETCH_DATA`, like this

```javascript
const fetchDataAction = {
  type: FETCH_DATA,
  meta: { type: ON_FETCH_SOMETHING_COMPLETE, cache: false },
  payload: [1, 2]
}
```

It dispatches `LOADING_START` and `LOADING_END` actions before data fetch starts and after it end.

On fetch complete it dispatches action

```javascript
{
  type: fetchDataAction.meta.type,
  payload: fetchResult,
  meta: fetchDataAction.meta
}
```

and on fetch error

```javascript
{
  type: fetchDataAction.meta.type,
  payload: error,
  error: true,
  meta: fetchDataAction.meta
}
```

If `FETCH_DATA` action meta has `cache: false` property, and action with same
`payload` and `meta.type` has already been successfully processed,
it does nothing (_as data is already in redux store_).

It `fetch` again if there where fetch error at previous call.

If `FETCH_DATA` action meta has `cache: true` property, it always fetch `data` again,
cancelling previous `FETCH_DATA` action with same `payload` and `meta.type`.

If such actions are called simultaneously first action does not run at all.

If sequentially action `LOADING_CANCEL` will be run.

Look at [tests](./tests/createFetchProcess.spec.js) for more examples.

# Install

```
npm install --save redux-observable-process-fetch
```
