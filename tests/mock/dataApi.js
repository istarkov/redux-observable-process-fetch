import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/fromPromise';

export const TEST_TIMEOUT = 20;

// In real case it's just (...args) => Obervable.ajax(...args)
export const dataCallWithCancel = (...args) =>
  Observable.create(observer => {
    const handler = setTimeout(
      () => args.length === 1 && args[0] === 'please throw'
        ? observer.error(new Error({ message: 'remote error', data: args }))
        : (observer.next({ apiResult: args }), observer.complete()),
      TEST_TIMEOUT
    );

    return () => {
      clearTimeout(handler);
    };
  });

export const throwAtFirstCall = () => {
  let counter = 0;
  return (...args) =>
    Observable.create(observer => {
      const handler = setTimeout(
        () => counter++ === 0
          ? observer.error(new Error({ message: 'remote error', data: args }))
          : (observer.next({ apiResult: args }), observer.complete()),
        TEST_TIMEOUT
      );

      return () => {
        clearTimeout(handler);
      };
    });
};
