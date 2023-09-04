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
  // const body = ReadableStream.from({
  //     [Symbol.asyncIterator]: () => ({
  //         async next() {
  //             return {
  //                 done: true,
  //                 value: JSON.stringify(await hash(data))
  //             };
  //         }
  //     })
  // });
  // const body = new ReadableStream({
  //     async pull() {
  //         return JSON.stringify(await hash(data))
  //     }
  // });

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
  // hash(data).then(JSON.stringify)
  //     .then(json => {
  //         stream.push(json);
  //         stream.push(null);
  //     })
  //     .catch(e => {
  //     hashSettled(data).then(result => {
  //         stream.push(JSON.stringify(result, errorReplacer));
  //         stream.push(null);
  //     });
  // })

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
export const ok: ResponseFunction = responseFunction.bind(null, 200);
export const created = responseFunction.bind(null, 201);
export const noContent = (init?: Init) =>
  new Response(null, {
    ...init,
    status: 204,
  });
export const resetContent = responseFunction.bind(null, 205);
export const partialContent = responseFunction.bind(null, 206);

// 3XX
export const movedPermanently = redirectFunction.bind(null, 301);
export const found = redirectFunction.bind(null, 302);
export const seeOther = redirectFunction.bind(null, 303);
export const notModified = redirectFunction.bind(null, 304);
export const temporaryRedirect = redirectFunction.bind(null, 307);
export const permanentRedirect = redirectFunction.bind(null, 308);

// 4XX
export const badRequest = responseFunction.bind(null, 400);
export const unauthorized = responseFunction.bind(null, 401);
export const forbidden = responseFunction.bind(null, 403);
export const notFound = responseFunction.bind(null, 404);
export const methodNotAllowed = responseFunction.bind(null, 405);
export const notAcceptable = responseFunction.bind(null, 406);
export const conflict = responseFunction.bind(null, 409);
export const gone = responseFunction.bind(null, 410);
export const preconditionFailed = responseFunction.bind(null, 412);
export const expectationFailed = responseFunction.bind(null, 417);
export const teapot = responseFunction.bind(null, 418);
export const preconditionRequired = responseFunction.bind(null, 428);
export const tooManyRequests = responseFunction.bind(null, 429);

// 5XX
export const serverError = responseFunction.bind(null, 500);
export const notImplemented = responseFunction.bind(null, 501);
export const serviceUnavailable = responseFunction.bind(null, 503);
