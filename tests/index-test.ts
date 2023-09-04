import { ok, noContent } from '../src/index';
import * as remixResponse from '../src/index';
import { expect, describe, it } from 'vitest';

describe('response object', async () => {
  it('returns a response object', async () => {
    const response = ok({});
    expect(response).toBeInstanceOf(Response);
  });

  it('resolves to a response object', async () => {
    const promise = ok({});
    expect(promise.then).toBeInstanceOf(Function);
    const response = await promise;
    expect(response).toBeInstanceOf(Response);
  });

  it('waits for promises to resolve', async () => {
    const response = await ok({
      a: Promise.resolve('a'),
      b: Promise.resolve('b'),
      c: Promise.resolve('c'),
    });
    expect(await response.json()).toEqual({
      a: 'a',
      b: 'b',
      c: 'c',
    });
  });

  it('rejects with a settled version of the object', async () => {
    const response = ok({
      a: Promise.resolve('a'),
      b: Promise.reject('b'),
      c: Promise.reject('c'),
    });
    expect(await response.json()).toEqual({
      a: {
        status: 'fulfilled',
        value: 'a',
      },
      b: {
        status: 'rejected',
        reason: 'b',
      },
      c: {
        status: 'rejected',
        reason: 'c',
      },
    });
  });

  it('uses a 500 status for rejected promises', async () => {
    let response;
    try {
      await ok({
        a: Promise.reject('a'),
      });
    } catch (error) {
      response = error;
    }
    expect(response.status).toBe(500);
  });

  it('serializes errors', async () => {
    const response = ok({
      a: Promise.reject(new TypeError('asdf')),
    });
    expect(await response.json()).toEqual({
      a: {
        status: 'rejected',
        reason: {
          isError: true,
          message: 'asdf',
          name: 'TypeError',
        },
      },
    });
  });
});

describe('status codes', () => {
  it.each([
    // 2XX
    ['ok', 200],
    ['created', 201],
    ['resetContent', 205],
    ['partialContent', 206],

    // 4XX
    ['badRequest', 400],
    ['unauthorized', 401],
    ['forbidden', 403],
    ['notFound', 404],
    ['methodNotAllowed', 405],
    ['notAcceptable', 406],
    ['conflict', 409],
    ['gone', 410],
    ['preconditionFailed', 412],
    ['expectationFailed', 417],
    ['teapot', 418],
    ['preconditionRequired', 428],
    ['tooManyRequests', 429],
    // 5XX
    ['serverError', 500],
    ['notImplemented', 501],
    ['serviceUnavailable', 503],
  ])('%s should have a status code of %i', (methodName, status) => {
    const response = remixResponse[methodName]({});
    expect(response.status).toBe(status);
  });

  it.each([
    ['movedPermanently', 301],
    ['found', 302],
    ['seeOther', 303],
    ['notModified', 304],
    ['temporaryRedirect', 307],
    ['permanentRedirect', 308],
  ])('%s redirect should have a status code of %i', (methodName, status) => {
    const response = remixResponse[methodName]('https://www.example.com');
    expect(response.status).toBe(status);
    expect(response.headers.get('location')).toBe('https://www.example.com');
  });

  it('noContent should have a status code of 204', () => {
    const response = noContent();
    expect(response.status).toBe(204);
    expect(response.body).toBe(null);
  });
});
