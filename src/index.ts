const Readable = require('stream').Readable;

export type TypedResponse<T = unknown> = Omit<Response, 'json'> & {
  json(): Promise<T>;
};

// TODO figure out how to type this correctly as a thenable.
// type ThenableTypedResponse<T = unknown> = TypedResponse<T> &
//  PromiseLike<TypedResponse<T>>;

export type ResponseFunction = <Data extends Record<string, any>>(
  data: Data,
  init?: Omit<ResponseInit, 'status'>
) => TypedResponse<{ -readonly [P in keyof Data]: Awaited<Data[P]> }>;

type Init = Parameters<ResponseFunction>[1];
type Data = Parameters<ResponseFunction>[0];

const hash = async (data: Data) => {
  const values = await Promise.all(Object.values(data));
  return Object.fromEntries(Object.keys(data).map((prop, i) => [prop, values[i]]));
};

const hashSettled = async (data: Data) => {
  const values = await Promise.allSettled(Object.values(data));
  return Object.fromEntries(Object.keys(data).map((prop, i) => [prop, values[i]]));
};

const errorReplacer = (_key: string, value: any) => {
  if (value instanceof Error) {
    return { message: value.message, name: value.name, isError: true };
  }
  return value;
};

const makeResponse = ({ status, body, init }: { status: number; body: BodyInit; init?: Init }) => {
  return new Response(body, {
    ...init,
    status,
    headers: {
      ...init?.headers,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};

const responseFunction = (status: number, data: Data, init?: Init) => {
  // Stream handes the case of a thrown response. We can't wrap that
  // in a thenable but we can defer the body until the promise is
  // resolved with a stream.
  const stream = new Readable();
  stream._read = () => {};
  // We always used allSettled for thrown responses because we want
  // the error data to be consistent in the ErrorBoundary.
  hashSettled(data).then(result => {
    stream.push(JSON.stringify(result, errorReplacer));
    stream.push(null);
  });

  // Return a promise instance so users can throw the response.
  let response = makeResponse({
    body: stream,
    status,
    init,
  });

  const then: PromiseLike<TypedResponse<Data>>['then'] = (cb, eb) => {
    return hash(data)
      .then(data => {
        return makeResponse({
          body: JSON.stringify(data),
          status,
          init,
        });
      })
      .catch(async () => {
        // For the error case we used a hashSettled so the
        // ErrorBoundary can see what options resolved /
        // rejected.
        const result = await hashSettled(data);

        return Promise.reject(
          makeResponse({
            body: JSON.stringify(result, errorReplacer),
            status: 500,
            init,
          })
        );
      })
      .then(cb, eb);
  };

  // Make this response a PromiseLike so if we reject after
  // returning a response we can update the status code to 500.
  // @ts-ignore
  response.then = then;
  return response;
};

const redirectFunction = (status: number, url: string) => {
  return new Response(null, {
    status,
    headers: { Location: url },
  });
};

// 2XX
/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 200`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This works similar to `Promise.all([])`, but takes an object
 * instead of an array for its promises argument
 *
 *
 * ```ts
 * import { ok } from 'remix-response';
 * export const loader = async () => {
 *   return ok({
 *     hello: 'world',
 *     promise: Promise.resolve('result'),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const ok: ResponseFunction = responseFunction.bind(null, 200);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 201`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * ```ts
 * import { created } from 'remix-response';
 * export const action = async () => {
 *   return created({
 *     status: 'new',
 *     id: Promise.resolve(1),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const created = responseFunction.bind(null, 201);

/**
 * This is a shortcut for creating a responses with `status: 204`.
 *
 * ```ts
 * import { created } from 'remix-response';
 * export const action = async () => {
 *   return noContent();
 * };
 * ```
 *
 * @param init? - An optional RequestInit configuration object.
 */
export const noContent = (init?: Init) =>
  new Response(null, {
    ...init,
    status: 204,
  });

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 205`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * ```ts
 * import { resetContent } from 'remix-response';
 * export const loader = async () => {
 *   return resetContent({
 *     form: {},
 *     id: Promise.resolve(1),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const resetContent = responseFunction.bind(null, 205);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 206`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * ```ts
 * import { partialContent } from 'remix-response';
 * export const loader = async () => {
 *   return partialContent({
 *     title: 'RFC 2616 - Hypertext Transfer Protocol -- HTTP/1.1',
 *     id: Promise.resolve(2616),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const partialContent = responseFunction.bind(null, 206);

// 3XX
/**
 * This is a shortcut for creating a redirect response with `status:
 * 301`. The provided string will be set as the location header in the
 * response.
 *
 * This should be used when the URL of the requested resource has been
 * changed permanently. Browsers will cache this redirect.
 *
 * ```ts
 * import { movedPermanently } from 'remix-response';
 * export const loader = async () => {
 *   return movedPermanently('https://www.example.com/');
 * };
 * ```
 *
 * @param url - A url to redirect the request to
 */
export const movedPermanently = redirectFunction.bind(null, 301);

/**
 * This is a shortcut for creating a redirect response with `status:
 * 302`. The provided string will be set as the location header in the
 * response.
 *
 * This should be used when the URI of requested resource has been
 * changed temporarily. Browsers will not cache this redirectly and it
 * is commonly used in action functions.
 *
 *
 * ```ts
 * import { found } from 'remix-response';
 * export const action = async () => {
 *   return found('https://www.example.com/');
 * };
 * ```
 *
 * @param url - A url to redirect the request to
 */
export const found = redirectFunction.bind(null, 302);

/**
 * This is a shortcut for creating a redirect response with `status:
 * 303`. The provided string will be set as the location header in the
 * response.
 *
 * This indicates that the redirects don't link to the requested
 * resource itself, but to another page (such as a confirmation page,
 * a representation of a real-world object or an upload-progress
 * page). This response code is often sent back as a result of PUT or
 * POST. The method used to display this redirected page is always
 * GET.
 *
 * ```ts
 * import { seeOther } from 'remix-response';
 * export const action = async () => {
 *   return seeOther('https://www.example.com/');
 * };
 * ```
 *
 * @param url - A url to redirect the request to
 */
export const seeOther = redirectFunction.bind(null, 303);

/**
 * This is a shortcut for creating a redirect response with `status:
 * 304`. The provided string will be set as the location header in the
 * response.
 *
 * This is used for caching purposes. It tells the client that the
 * response has not been modified, so the client can continue to use
 * the same cached version of the response.
 *
 * ```ts
 * import { notModified } from 'remix-response';
 * export const loader = async ({ request }: LoaderArgs) => {
 *   if (request.headers.get('If-Modified-Since') === 'Wed, 21 Oct 2015 07:28:00 GMT') {
 *     return notModified(request.url);
 *   }
 * };
 * ```
 *
 * @param url - A url to redirect the request to
 */
export const notModified = redirectFunction.bind(null, 304);

/**
 * This is a shortcut for creating a redirect response with `status:
 * 307`. The provided string will be set as the location header in the
 * response.
 *
 * This should be used to direct the client to get the requested
 * resource at another URI with the same method that was used in the
 * prior request. This has the same semantics as the `302 Found` HTTP
 * response code, with the exception that the user agent must not
 * change the HTTP method used: if a `POST` was used in the first
 * request, a `POST` must be used in the second request.
 *
 *
 * ```ts
 * import { temporaryRedirect } from 'remix-response';
 * export const action = async () => {
 *   return temporaryRedirect('https://www.example.com/');
 * };
 * ```
 *
 * @param url - A url to redirect the request to
 */
export const temporaryRedirect = redirectFunction.bind(null, 307);

/**
 * This is a shortcut for creating a redirect response with `status:
 * 308`. The provided string will be set as the location header in the
 * response.
 *
 * This means that the resource is now permanently located at another
 * URI. This has the same semantics as the `301 Moved Permanently` HTTP
 * response code, with the exception that the user agent must not
 * change the HTTP method used: if a `POST` was used in the first
 * request, a `POST` must be used in the second request.
 *
 * ```ts
 * import { permanentRedirect } from 'remix-response';
 * export const action = async () => {
 *   return permanentRedirect('https://www.example.com/');
 * };
 * ```
 *
 * @param url - A url to redirect the request to
 */
export const permanentRedirect = redirectFunction.bind(null, 308);

// 4XX
/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 400`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This should be used when the action cannot or will not process the
 * request due to something that is perceived to be a client error.
 *
 * ```ts
 * import type { ActionArgs } from "@remix-run/node";
 * import { badRequest } from 'remix-response';
 * export async function action({ request }: ActionArgs) {
 *   return badRequest({
 *     form: request.formData(),
 *     errors: Promise.resolve({name: 'missing'}),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const badRequest = responseFunction.bind(null, 400);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 401`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This should be used when the action cannot or will not process the
 * request because the user is unauthenticated.
 *
 * Although the HTTP standard specifies "unauthorized", semantically
 * this response means "unauthenticated". That is, the client must
 * authenticate itself to get the requested response.
 *
 * ```ts
 * import type { ActionArgs } from "@remix-run/node";
 * import { unauthorized } from 'remix-response';
 * export async function action({ request }: ActionArgs) {
 *   return unauthorized({
 *     form: request.formData(),
 *     errors: Promise.resolve({user: 'missing'}),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const unauthorized = responseFunction.bind(null, 401);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 403`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This should be used when the action cannot or will not process the
 * request because the user does not have access rights to the
 * content; that is, it is unauthorized, so the server is refusing to
 * give the requested resource. Unlike `401 Unauthorized`, the client's
 * identity is known to the server.
 *
 * ```ts
 * import type { ActionArgs } from "@remix-run/node";
 * import { forbidden } from 'remix-response';
 * export async function action({ request }: ActionArgs) {
 *   return forbidden({
 *     form: request.formData(),
 *     errors: Promise.resolve({user: 'missing'}),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const forbidden = responseFunction.bind(null, 403);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 404`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This should be used when the loader find the requested resource. In
 * the browser, this means the URL is not recognized and the brower
 * will not suggest the URL as an autocomplete option int he future
 *
 * ```ts
 * import { notFound } from 'remix-response';
 * export async function loader() {
 *   return notFound({
 *     recommendations: []
 *     fromTheBlog: Promise.resolve([]),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const notFound = responseFunction.bind(null, 404);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 405`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This should be used when the request method is known by the server
 * but is not supported by the target resource. For example, an API
 * may not allow calling DELETE to remove a resource.
 *
 * ```ts
 * import { methodNotAllowed } from 'remix-response';
 * export async function action() {
 *   return methodNotAllowed({
 *     allowedMethods: Promise.resolve(['GET', 'POST']),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const methodNotAllowed = responseFunction.bind(null, 405);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 406`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This indicates that the server cannot produce a response matching
 * the list of acceptable values defined in the request's proactive
 * content negotiation headers, and that the server is unwilling to
 * supply a default representation.
 *
 * Proactive content negotiation headers include: `Accept`, `Accept-Encoding`, `Accept-Language`.
 *
 * In practice, this error is very rarely used. Instead of responding
 * using this error code, which would be cryptic for the end user and
 * difficult to fix, servers ignore the relevant header and serve an
 * actual page to the user. It is assumed that even if the user won't
 * be completely happy, they will prefer this to an error code.
 *
 * If a server returns such an error status, the body of the message
 * should contain the list of the available representations of the
 * resources, allowing the user to choose among them.
 *
 * ```ts
 * import { notAcceptable } from 'remix-response';
 * export async function action() {
 *   return notAcceptable({
 *     allowedLanguage: Promise.resolve(['US_en', 'US_es']),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const notAcceptable = responseFunction.bind(null, 406);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 409`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This should be used to indicate aa request conflicts with the
 * current state of the server.
 *
 * ```ts
 * import { conflict } from 'remix-response';
 * export async function action() {
 *   return conflict({
 *     error: Promise.resolve({ id: 'duplicate id' }),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const conflict = responseFunction.bind(null, 409);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 410`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This should be used when a resource has been permanently deleted
 * from server, with no forwarding address. Clients are expected to
 * remove their caches and links to the resource.
 *
 * ```ts
 * import { gone } from 'remix-response';
 * export async function action() {
 *   return gone({
 *     error: Promise.resolve('resource deleted'),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const gone = responseFunction.bind(null, 410);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 412`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This should be used to indicated the client sent preconditions in
 * its headers (usually `If-Unmodified-Since` or `If-None-Match`) which
 * the server does not meet.
 *
 * ```ts
 * import { preconditionFailed } from 'remix-response';
 * export async function action() {
 *   return preconditionFailed({
 *     modifiedSince: Promise.resolve(Date.now()),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const preconditionFailed = responseFunction.bind(null, 412);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 417`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This should be used to indicated the expectation indicated by the
 * `Expect` request header field cannot be met by the server.
 *
 *
 * ```ts
 * import { expectationFailed } from 'remix-response';
 * export async function action() {
 *   return expectationFailed({
 *     error: Promise.resolve('Content-Length is too large.'),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const expectationFailed = responseFunction.bind(null, 417);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 418`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * The server refuses the attempt to brew coffee with a teapot.
 *
 *
 * ```ts
 * import { teapot } from 'remix-response';
 * export async function action() {
 *   return teapot({
 *     error: Promise.resolve('🚫☕'),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const teapot = responseFunction.bind(null, 418);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 428`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This is used to indicate the the request must be conditional. This
 * response is intended to prevent the 'lost update' problem, where a
 * client GETs a resource's state, modifies it and PUTs it back to the
 * server, when meanwhile a third party has modified the state on the
 * server, leading to a conflict.
 *
 * ```ts
 * import { preconditionFailed } from 'remix-response';
 * export async function action() {
 *   return preconditionFailed({
 *     error: Promise.resolve('Missing If-Match header.'),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const preconditionRequired = responseFunction.bind(null, 428);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 429`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This is used to indacate the user has sent too many requests in a
 * given amount of time ("rate limiting").
 *
 * ```ts
 * import { tooManyRequests } from 'remix-response';
 * export async function action() {
 *   return tooManyRequests({
 *     retryIn: Promise.resolve(5 * 60 * 1000),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const tooManyRequests = responseFunction.bind(null, 429);

// 5XX
/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 500`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * The server has encountered a situation it does not know how to handle.
 *
 * ```ts
 * import { serverError } from 'remix-response';
 * export async function loader() {
 *   throw serverError({
 *     error: Promise.resolve('Unable to load resouce.'),
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const serverError = responseFunction.bind(null, 500);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 501`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * This is used to indicate the server does not support the functionality
 * required to fulfill the request. This status can also send a
 * `Retry-After` header, telling the requester when to check back to see
 * if the functionality is supported by then.
 *
 * ```ts
 * import { notImplemented } from 'remix-response';
 * export async function loader() {
 *   throw notImplemented({
 *     error: Promise.resolve('Unable to load resouce.'),
 *   }, {
 *     headers: { 'Retry-After': 300 }
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const notImplemented = responseFunction.bind(null, 501);

/**
 * This is a shortcut for creating `application/json` responses with
 * `status: 503`. Converts `data` into JSON when all the given
 * promises have been fulfilled. The serialized JSON body is an object
 * that has the same key names as the promises object argument. If any
 * of the values in the object are not promises, they will simply be
 * copied over to the fulfilled object.
 *
 * The server is not ready to handle the request. Common causes are a
 * server that is down for maintenance or that is overloaded. This
 * response should be used for temporary conditions and the
 * `Retry-After` HTTP header should, if possible, contain the
 * estimated time before the recovery of the service. This is used to
 * indicate the server does not support the functionality
 *
 * ```ts
 * import { serviceUnavailable } from 'remix-response';
 * export async function loader() {
 *   throw serviceUnavailable({
 *     error: Promise.resolve('Unable to load resouce.'),
 *   }, {
 *     headers: { 'Retry-After': 300 }
 *   });
 * };
 * ```
 *
 * @param data - A JavaScript object that will be serialized as JSON.
 * @param init? - An optional RequestInit configuration object.
 */
export const serviceUnavailable = responseFunction.bind(null, 503);
