// `npm bin`/mocha --compilers js:babel-register --reporter min --watch './tests/*.spec.js'
import expect from 'expect';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/merge';
// import 'rxjs/add/observable/dom/ajax';

import { createStore, applyMiddleware } from 'redux';
import { reduxObservable } from 'redux-observable';

import { createFetchProcess } from '../src';
import {
  FETCH_DATA, FETCH_CLEAR_CACHE,
  LOADING_START, LOADING_END, LOADING_CANCEL,
} from '../src/ActionTypes';

import { dataCallWithCancel, throwAtFirstCall, TEST_TIMEOUT } from './mock/dataApi';

// TODO replace with redux-observable combineDelegators
const combineDelegators = (...delegators) => (actions, store) =>
    Observable.merge(...(delegators.map((delegator) => delegator(actions, store))));

// Initialize redux + redux-observable + redux-observable-processor
const ctreateStoreWithReduxObservableMiddleware = ({ fetch }) => {
  const reducer = (state = [], action) => state
    .concat(action)
    .filter(({ type }) => ['@@redux/INIT', FETCH_DATA, FETCH_CLEAR_CACHE].indexOf(type) === -1);
  // create Processor
  const processor = combineDelegators(
    createFetchProcess({ fetch })
  );
  const middleware = reduxObservable(processor);

  const store = createStore(reducer, applyMiddleware(middleware));
  return store;
};

// fetch action creator
const createFetchAction = (actionType, preferCache, meta, ...args) => ({
  type: FETCH_DATA,
  meta: { ...meta, type: actionType, cache: preferCache },
  payload: args,
});

const PREFER_CACHE = true;
const PREFER_REFETCH = false;

describe('createFetchProcess test', () => {
  describe('Loading Actions', () => {
    it('should generate LOADING_START LOADING_END events', (done) => {
      const store = ctreateStoreWithReduxObservableMiddleware({ fetch: dataCallWithCancel });
      const LOAD_MY_OBJECT = 'LOAD_MY_OBJECT';

      store.dispatch(
        createFetchAction(LOAD_MY_OBJECT, PREFER_CACHE, {}, 1, 2)
      );

      setTimeout(() => {
        const state = store.getState();
        expect(state.map(({ type }) => type))
          .toEqual([LOADING_START, LOAD_MY_OBJECT, LOADING_END]);
        done();
      }, 100);
    });

    it('should generate LOADING_START LOADING_END events even on fech Error', (done) => {
      const store = ctreateStoreWithReduxObservableMiddleware({ fetch: dataCallWithCancel });
      const LOAD_MY_OBJECT = 'LOAD_MY_OBJECT';

      store.dispatch(
        createFetchAction(LOAD_MY_OBJECT, PREFER_CACHE, {}, 'please throw')
      );

      setTimeout(() => {
        const state = store.getState();
        expect(state.map(({ type, error }) => ({ type, ...(error && { error }) })))
          .toEqual([
            { type: LOADING_START },
            { type: LOAD_MY_OBJECT, error: true },
            { type: LOADING_END },
          ]);

        done();
      }, 100);
    });
  });


  describe('Prefer Cache', () => {
    it('should not dipatch action for same type + paylod', (done) => {
      const store = ctreateStoreWithReduxObservableMiddleware({ fetch: dataCallWithCancel });
      const LOAD_MY_OBJECT = 'LOAD_MY_OBJECT';

      const [FIRST_CALL, NEXT_CALL] = [1, 2];

      store.dispatch(
        createFetchAction(LOAD_MY_OBJECT, PREFER_CACHE, { test: FIRST_CALL }, 'bar', 'foo')
      );
      store.dispatch(
        createFetchAction(LOAD_MY_OBJECT, PREFER_CACHE, { test: NEXT_CALL }, 'bar', 'foo')
      );

      setTimeout(
        () => store.dispatch(
          createFetchAction(LOAD_MY_OBJECT, PREFER_CACHE, { test: NEXT_CALL }, 'bar', 'foo')
        ),
        TEST_TIMEOUT / 2
      );

      setTimeout(
        () => store.dispatch(
          createFetchAction(LOAD_MY_OBJECT, PREFER_CACHE, { test: NEXT_CALL }, 'bar', 'foo')
        ),
        TEST_TIMEOUT * 2
      );

      setTimeout(() => {
        const state = store.getState();
        expect(state.map(({ type, meta: { test } }) => ({ type, ...(test && { test }) })))
          .toEqual([ // FIRST_CALL SECOND_CALL wins
            { type: LOADING_START, test: FIRST_CALL },
            { type: LOAD_MY_OBJECT, test: FIRST_CALL },
            { type: LOADING_END, test: FIRST_CALL },
          ]);

        done();
      }, 100);
    });

    it('should refetch if previous call ends with error', (done) => {
      const store = ctreateStoreWithReduxObservableMiddleware({ fetch: throwAtFirstCall() });
      const LOAD_MY_OBJECT = 'LOAD_MY_OBJECT__';

      const [FIRST_CALL, NEXT_CALL] = [1, 2];

      store.dispatch(
        createFetchAction(LOAD_MY_OBJECT, PREFER_CACHE, { test: FIRST_CALL }, 'bar', 'foo')
      );

      setTimeout(() =>
        store.dispatch(
          createFetchAction(LOAD_MY_OBJECT, PREFER_CACHE, { test: NEXT_CALL }, 'bar', 'foo')
        ),
        TEST_TIMEOUT * 2
      );

      setTimeout(() => {
        const state = store.getState();
        expect(
          state
            .filter(({ type }) => type === LOAD_MY_OBJECT)
            .map(({ error }) => !!error)
        ).toEqual([true, false]);
        done();
      }, 100);
    });

    it('should dipatch action for different payload or type', (done) => {
      const store = ctreateStoreWithReduxObservableMiddleware({ fetch: dataCallWithCancel });
      const LOAD_MY_OBJECT = 'LOAD_MY_OBJECT';
      const LOAD_MY_OTHER_OBJECT = 'LOAD_MY_OTHER_OBJECT';

      store.dispatch(
        createFetchAction(LOAD_MY_OBJECT, PREFER_CACHE, {}, 'bar', 'foo')
      );
      store.dispatch(
        createFetchAction(LOAD_MY_OBJECT, PREFER_CACHE, {}, 'foo', 'bar')
      );
      store.dispatch(
        createFetchAction(LOAD_MY_OTHER_OBJECT, PREFER_CACHE, {}, 'bar', 'foo')
      );

      setTimeout(() => {
        const state = store.getState();

        expect(
          state
            .filter(({ type }) => type === LOAD_MY_OBJECT || type === LOAD_MY_OTHER_OBJECT)
            .map(({ type, payload }) => ({ type, payload }))
        )
        .toEqual([
          { type: LOAD_MY_OBJECT, payload: { apiResult: ['bar', 'foo'] } },
          { type: LOAD_MY_OBJECT, payload: { apiResult: ['foo', 'bar'] } },
          { type: LOAD_MY_OTHER_OBJECT, payload: { apiResult: ['bar', 'foo'] } },
        ]);

        done();
      }, 90);
    });
  });

  describe('Prefer Refetch', () => {
    it('should not start previous and fetch curent if run simultaneously', (done) => {
      const store = ctreateStoreWithReduxObservableMiddleware({ fetch: dataCallWithCancel });
      const LOAD_MY_OBJECT = 'LOAD_MY_OBJECT';
      const [FIRST_CALL, SECOND_CALL] = [1, 2];
      store.dispatch(
        createFetchAction(LOAD_MY_OBJECT, PREFER_REFETCH, { test: FIRST_CALL }, 'bar', 'foo')
      );
      store.dispatch(
        createFetchAction(LOAD_MY_OBJECT, PREFER_REFETCH, { test: SECOND_CALL }, 'bar', 'foo')
      );

      setTimeout(() => {
        const state = store.getState();
        expect(state.map(({ type, meta: { test } }) => ({ type, test })))
          .toEqual([ // SECOND_CALL wins
            { type: LOADING_START, test: SECOND_CALL },
            { type: LOAD_MY_OBJECT, test: SECOND_CALL },
            { type: LOADING_END, test: SECOND_CALL },
          ]);

        done();
      }, 100);
    });

    it('should cancel previous and fetch curent if previous is already running', (done) => {
      const store = ctreateStoreWithReduxObservableMiddleware({ fetch: dataCallWithCancel });
      const LOAD_MY_OBJECT = 'LOAD_MY_OBJECT';
      const [FIRST_CALL, SECOND_CALL] = [1, 2];
      store.dispatch(
        createFetchAction(LOAD_MY_OBJECT, PREFER_REFETCH, { test: FIRST_CALL }, 'bar', 'foo')
      );

      setTimeout(
        () =>
          store.dispatch(
            createFetchAction(LOAD_MY_OBJECT, PREFER_REFETCH, { test: SECOND_CALL }, 'bar', 'foo')
          ),
        0
      );

      setTimeout(() => {
        const state = store.getState();
        expect(
          state
            .map(({ type, meta: { test } }) => ({ type, test }))
        ).toEqual([
          { type: LOADING_START, test: 1 },
          { type: LOADING_CANCEL, test: 1 },
          { type: LOADING_START, test: 2 },
          { type: LOAD_MY_OBJECT, test: 2 },
          { type: LOADING_END, test: 2 },
        ]);

        done();
      }, 100);
    });

    it('should fetch curent if previous is already fetched', (done) => {
      const store = ctreateStoreWithReduxObservableMiddleware({ fetch: dataCallWithCancel });
      const LOAD_MY_OBJECT = 'LOAD_MY_OBJECT';
      const [FIRST_CALL, SECOND_CALL] = [1, 2];
      store.dispatch(
        createFetchAction(LOAD_MY_OBJECT, PREFER_REFETCH, { test: FIRST_CALL }, 'bar', 'foo')
      );

      setTimeout(
        () =>
          store.dispatch(
            createFetchAction(LOAD_MY_OBJECT, PREFER_REFETCH, { test: SECOND_CALL }, 'bar', 'foo')
          ),
        TEST_TIMEOUT * 2
      );

      setTimeout(() => {
        const state = store.getState();
        expect(
          state
            .map(({ type, meta: { test } }) => ({ type, test }))
        ).toEqual([
          { type: LOADING_START, test: 1 },
          { type: LOAD_MY_OBJECT, test: 1 },
          { type: LOADING_END, test: 1 },
          { type: LOADING_START, test: 2 },
          { type: LOAD_MY_OBJECT, test: 2 },
          { type: LOADING_END, test: 2 },
        ]);

        done();
      }, 100);
    });
  });
});
