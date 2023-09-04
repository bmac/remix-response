# remix-response
Semantic response helpers for your remix app.

`remix-response` provides response helpers that wait on all promises to
resolve before serializing the response.

## Basic Usage

```sh
yarn add remix-response
```

```ts
import type { LoaderArgs } from "@remix-run/node";
import { ok } from 'remix-response';

const wait = (delay: number) => new Promise((r) => setTimeout(r, delay));
const fetchListings = (search: string) => wait(600).then(() => []);
const fetchRecommendations = (user: unknown) => wait(300).then(() => []);

export const loader = async ({ request, context }: LoaderArgs) => {
  const listings = fetchListings(request.url);
  const recommendations = fetchRecommendations(context.user);

  return ok({
    listings, // Promise<[]>
    recommendations, // Promise<[]>
  });
};

export default function MyRouteComponent() {
    const data = useLoaderData<typeof loader>(); // { listings: [], recommendations: [] }
    // ...
}
```

### Don't go chasin' waterfalls

The simplest way fetch data in a remix loader is to use an async
function and unwrap every promise with await. 

```ts
import type { LoaderArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

const wait = (delay: number) => new Promise((r) => setTimeout(r, delay));
const fetchListings = (search: string) => wait(600).then(() => []);
const fetchRecommendations = (user: unknown) => wait(300).then(() => []);

export const loader = async ({ request, context }: LoaderArgs) => {
  const listings = await fetchListings(request.url);
  const recommendations = await fetchRecommendations(context.user);

  return json({
    listings,
    recommendations,
  });
};
```

However, if we need to fetch data from multiple independent sources
this can slow down the loader response since `fetchRecommendations`
doesn't start until after the `fetchListings` request has been
completed. A better approach would be to delay waiting until all the
fetchs have been iniated.

```diff
export const loader = async ({ request, context }: LoaderArgs) => {
-  const listings = await fetchListings(request.url);
+  const listings = fetchListings(request.url);
-  const recommendations = await fetchRecommendations(context.user);
+  const recommendations = fetchRecommendations(context.user);

  return json({
-    listings,
+    listings: await listings,
-    recommendations,
+    recommendations: await recommendations,
  });
};
```

This change improves the time it takes to run the loader function
because we now all the fetches are run in parallel and we only need to
wait for the longest fetch to complete.

`remix-response` can simplifiy things a bit further by automatically
awaiting any promises provided to the top level object before
serializing the response.

This is similar to the behavior of `Promise.all` but it preserves the
object shape and keys similar to `RSVP.hash` or bluebird's
`Promise.props`.

```diff
- import { json } from "@remix-run/node";
+ import { ok } from 'remix-response';

export const loader = async ({ request, context }: LoaderArgs) => {
  const listings = fetchListings(request.url);
  const recommendations = fetchRecommendations(context.user);

  return ok({
-    listings: await listings,
+    listings,
-    recommendations: await recommendations,
+    recommendations,
  });
};
```


### Errors

When returning a response, if any of the promise reject the response
will have a 500 status code. The data object will contain all of the
properites with an object similar to `Promise.allSettled` indicating
if the promise was fulfilled or rejected and the value/reason. This
object can be used in your ErrorBoundary to render the appropriate
error message.

```ts
import type { LoaderArgs } from "@remix-run/node";
import { ok } from 'remix-response';

const wait = (delay: number) => new Promise((r) => setTimeout(r, delay));
const fetchListings = (search: string) => wait(600).then(() => []);
const fetchRecommendations = (user: unknown) => wait(300).then(() => []);

export const loader = async ({ request, context }: LoaderArgs) => {
  const listings = fetchListings(request.url);
  const recommendations = fetchRecommendations(context.user);

  return ok({
    listings, // Promise<[]>
    recommendations, // Promise<[]>
    ohNo: Promise.reject('oops!'),
  });
};

export function ErrorBoundary() {
  const error = useRouteError();
  // {
  //   status: 500,
  //   statusText: 'Server Error',
  //   data: {
  //     listings: { status: 'fulfilled', value: [] },
  //     recommendations: { status: 'fulfilled', value: [] },
  //     ohNo: { status: 'rejected', reason: 'oops' },
  //   }
  // }

    return (
      <div>
        <h1>
          {error.status} {error.statusText}
        </h1>
        <pre>{JSON.stringify(error.data, null, 2)}</pre>
      </div>
    );
}
```

If a response is thrown in the loader this indicates an error. Thrown
responses will always keep their original status even if a promise
rejects. Unlike a returned response, thown responses always use a
settled object format with the status and value/reason. This is to
ensure the shape will always be consistent in the ErrorBoundary
component.

```ts
import type { LoaderArgs } from "@remix-run/node";
import { notFound } from 'remix-response';

const wait = (delay: number) => new Promise((r) => setTimeout(r, delay));
const fetchListings = (search: string) => wait(600).then(() => []);
const fetchRecommendations = (user: unknown) => wait(300).then(() => []);

export const loader = async ({ request, context }: LoaderArgs) => {
  const listings = fetchListings(request.url);
  const recommendations = fetchRecommendations(context.user);

  throw notFound({
    listings, // Promise<[]>
    recommendations, // Promise<[]>
  });
};

export function ErrorBoundary() {
  const error = useRouteError();
  // {
  //   status: 404,
  //   statusText: 'Not Found',
  //   data: {
  //     listings: { status: 'fulfilled', value: [] },
  //     recommendations: { status: 'fulfilled', value: [] },
  //   }
  // }

  return null;
}
```

## API

<!--DOCS_START-->
<a name="ok"></a>

## ok
<p>This is a shortcut for creating <code>application/json</code> responses. Converts <code>data</code>
to JSON and sets the <code>Content-Type</code> header.</p>
<p>This works similar to <code>Promise.all([])</code>, but takes an object
instead of an array for its promises argument</p>
<p>This is a shortcut for creating <code>application/json</code> responses with
status: 200. Converts <code>data</code> into JSON when all the given promises
have been fulfilled. The serialized JSON body is an object that has
the same key names as the promises object argument. If any of the
values in the object are not promises, they will simply be copied
over to the fulfilled object.</p>

**Kind**: global constant  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |


<!--DOCS_END-->
