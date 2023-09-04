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
## Members

<dl>
<dt><a href="#ok">ok</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 201</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<pre class="prettyprint source lang-ts"><code>import { created } from 'remix-response';
export const action = async () => {
  return created({
    status: 'new',
    id: Promise.resolve(1),
  });
};
</code></pre></dd>
<dt><a href="#created">created</a></dt>
<dd><p>This is a shortcut for creating a responses with <code>status: 204</code>.</p>
<pre class="prettyprint source lang-ts"><code>import { created } from 'remix-response';
export const action = async () => {
  return noContent();
};
</code></pre></dd>
<dt><a href="#noContent">noContent</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 205</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<pre class="prettyprint source lang-ts"><code>import { resetContent } from 'remix-response';
export const loader = async () => {
  return resetContent({
    form: {},
    id: Promise.resolve(1),
  });
};
</code></pre></dd>
<dt><a href="#resetContent">resetContent</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 206</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<pre class="prettyprint source lang-ts"><code>import { partialContent } from 'remix-response';
export const loader = async () => {
  return partialContent({
    title: 'RFC 2616 - Hypertext Transfer Protocol -- HTTP/1.1',
    id: Promise.resolve(2616),
  });
};
</code></pre></dd>
<dt><a href="#partialContent">partialContent</a></dt>
<dd><p>This is a shortcut for creating a redirect response with <code>status: 301</code>. The provided string will be set as the location header in the
response.</p>
<p>This should be used when the URL of the requested resource has been
changed permanently. Browsers will cache this redirect.</p>
<pre class="prettyprint source lang-ts"><code>import { movedPermanently } from 'remix-response';
export const loader = async () => {
  return movedPermanently('https://www.example.com/');
};
</code></pre></dd>
<dt><a href="#movedPermanently">movedPermanently</a></dt>
<dd><p>This is a shortcut for creating a redirect response with <code>status: 302</code>. The provided string will be set as the location header in the
response.</p>
<p>This should be used when the URI of requested resource has been
changed temporarily. Browsers will not cache this redirectly and it
is commonly used in action functions.</p>
<pre class="prettyprint source lang-ts"><code>import { found } from 'remix-response';
export const action = async () => {
  return found('https://www.example.com/');
};
</code></pre></dd>
<dt><a href="#found">found</a></dt>
<dd><p>This is a shortcut for creating a redirect response with <code>status: 303</code>. The provided string will be set as the location header in the
response.</p>
<p>This indicates that the redirects don't link to the requested
resource itself, but to another page (such as a confirmation page,
a representation of a real-world object or an upload-progress
page). This response code is often sent back as a result of PUT or
POST. The method used to display this redirected page is always
GET.</p>
<pre class="prettyprint source lang-ts"><code>import { seeOther } from 'remix-response';
export const action = async () => {
  return seeOther('https://www.example.com/');
};
</code></pre></dd>
<dt><a href="#seeOther">seeOther</a></dt>
<dd><p>This is a shortcut for creating a redirect response with <code>status: 304</code>. The provided string will be set as the location header in the
response.</p>
<p>This is used for caching purposes. It tells the client that the
response has not been modified, so the client can continue to use
the same cached version of the response.</p>
<pre class="prettyprint source lang-ts"><code>import { notModified } from 'remix-response';
export const loader = async ({ request }: LoaderArgs) => {
  if (request.headers.get('If-Modified-Since') === 'Wed, 21 Oct 2015 07:28:00 GMT') {
    return notModified(request.url);
  }
};
</code></pre></dd>
<dt><a href="#notModified">notModified</a></dt>
<dd><p>This is a shortcut for creating a redirect response with <code>status: 307</code>. The provided string will be set as the location header in the
response.</p>
<p>This should be used to direct the client to get the requested
resource at another URI with the same method that was used in the
prior request. This has the same semantics as the <code>302 Found</code> HTTP
response code, with the exception that the user agent must not
change the HTTP method used: if a <code>POST</code> was used in the first
request, a <code>POST</code> must be used in the second request.</p>
<pre class="prettyprint source lang-ts"><code>import { temporaryRedirect } from 'remix-response';
export const action = async () => {
  return temporaryRedirect('https://www.example.com/');
};
</code></pre></dd>
<dt><a href="#temporaryRedirect">temporaryRedirect</a></dt>
<dd><p>This is a shortcut for creating a redirect response with <code>status: 308</code>. The provided string will be set as the location header in the
response.</p>
<p>This means that the resource is now permanently located at another
URI. This has the same semantics as the <code>301 Moved Permanently</code> HTTP
response code, with the exception that the user agent must not
change the HTTP method used: if a <code>POST</code> was used in the first
request, a <code>POST</code> must be used in the second request.</p>
<pre class="prettyprint source lang-ts"><code>import { permanentRedirect } from 'remix-response';
export const action = async () => {
  return permanentRedirect('https://www.example.com/');
};
</code></pre></dd>
<dt><a href="#permanentRedirect">permanentRedirect</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 400</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used when the action cannot or will not process the
request due to something that is perceived to be a client error.</p>
<pre class="prettyprint source lang-ts"><code>import type { ActionArgs } from &quot;@remix-run/node&quot;;
import { badRequest } from 'remix-response';
export async function action({ request }: ActionArgs) {
  return badRequest({
    form: request.formData(),
    errors: Promise.resolve({name: 'missing'}),
  });
};
</code></pre></dd>
<dt><a href="#badRequest">badRequest</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 401</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used when the action cannot or will not process the
request because the user is unauthenticated.</p>
<p>Although the HTTP standard specifies &quot;unauthorized&quot;, semantically
this response means &quot;unauthenticated&quot;. That is, the client must
authenticate itself to get the requested response.</p>
<pre class="prettyprint source lang-ts"><code>import type { ActionArgs } from &quot;@remix-run/node&quot;;
import { unauthorized } from 'remix-response';
export async function action({ request }: ActionArgs) {
  return unauthorized({
    form: request.formData(),
    errors: Promise.resolve({user: 'missing'}),
  });
};
</code></pre></dd>
<dt><a href="#unauthorized">unauthorized</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 403</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used when the action cannot or will not process the
request because the user does not have access rights to the
content; that is, it is unauthorized, so the server is refusing to
give the requested resource. Unlike <code>401 Unauthorized</code>, the client's
identity is known to the server.</p>
<pre class="prettyprint source lang-ts"><code>import type { ActionArgs } from &quot;@remix-run/node&quot;;
import { forbidden } from 'remix-response';
export async function action({ request }: ActionArgs) {
  return forbidden({
    form: request.formData(),
    errors: Promise.resolve({user: 'missing'}),
  });
};
</code></pre></dd>
<dt><a href="#forbidden">forbidden</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 404</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used when the loader find the requested resource. In
the browser, this means the URL is not recognized and the brower
will not suggest the URL as an autocomplete option int he future</p>
<pre class="prettyprint source lang-ts"><code>import { notFound } from 'remix-response';
export async function loader() {
  return notFound({
    recommendations: []
    fromTheBlog: Promise.resolve([]),
  });
};
</code></pre></dd>
<dt><a href="#notFound">notFound</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 405</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used when the request method is known by the server
but is not supported by the target resource. For example, an API
may not allow calling DELETE to remove a resource.</p>
<pre class="prettyprint source lang-ts"><code>import { methodNotAllowed } from 'remix-response';
export async function action() {
  return methodNotAllowed({
    allowedMethods: Promise.resolve(['GET', 'POST']),
  });
};
</code></pre></dd>
<dt><a href="#methodNotAllowed">methodNotAllowed</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 406</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This indicates that the server cannot produce a response matching
the list of acceptable values defined in the request's proactive
content negotiation headers, and that the server is unwilling to
supply a default representation.</p>
<p>Proactive content negotiation headers include: <code>Accept</code>, <code>Accept-Encoding</code>, <code>Accept-Language</code>.</p>
<p>In practice, this error is very rarely used. Instead of responding
using this error code, which would be cryptic for the end user and
difficult to fix, servers ignore the relevant header and serve an
actual page to the user. It is assumed that even if the user won't
be completely happy, they will prefer this to an error code.</p>
<p>If a server returns such an error status, the body of the message
should contain the list of the available representations of the
resources, allowing the user to choose among them.</p>
<pre class="prettyprint source lang-ts"><code>import { notAcceptable } from 'remix-response';
export async function action() {
  return notAcceptable({
    allowedLanguage: Promise.resolve(['US_en', 'US_es']),
  });
};
</code></pre></dd>
<dt><a href="#notAcceptable">notAcceptable</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 409</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used to indicate aa request conflicts with the
current state of the server.</p>
<pre class="prettyprint source lang-ts"><code>import { conflict } from 'remix-response';
export async function action() {
  return conflict({
    error: Promise.resolve({ id: 'duplicate id' }),
  });
};
</code></pre></dd>
<dt><a href="#conflict">conflict</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 410</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used when a resource has been permanently deleted
from server, with no forwarding address. Clients are expected to
remove their caches and links to the resource.</p>
<pre class="prettyprint source lang-ts"><code>import { gone } from 'remix-response';
export async function action() {
  return gone({
    error: Promise.resolve('resource deleted'),
  });
};
</code></pre></dd>
<dt><a href="#gone">gone</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 412</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used to indicated the client sent preconditions in
its headers (usually <code>If-Unmodified-Since</code> or <code>If-None-Match</code>) which
the server does not meet.</p>
<pre class="prettyprint source lang-ts"><code>import { preconditionFailed } from 'remix-response';
export async function action() {
  return preconditionFailed({
    modifiedSince: Promise.resolve(Date.now()),
  });
};
</code></pre></dd>
<dt><a href="#preconditionFailed">preconditionFailed</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 417</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used to indicated the expectation indicated by the
<code>Expect</code> request header field cannot be met by the server.</p>
<pre class="prettyprint source lang-ts"><code>import { expectationFailed } from 'remix-response';
export async function action() {
  return expectationFailed({
    error: Promise.resolve('Content-Length is too large.'),
  });
};
</code></pre></dd>
<dt><a href="#expectationFailed">expectationFailed</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 418</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>The server refuses the attempt to brew coffee with a teapot.</p>
<pre class="prettyprint source lang-ts"><code>import { teapot } from 'remix-response';
export async function action() {
  return teapot({
    error: Promise.resolve('🚫☕'),
  });
};
</code></pre></dd>
<dt><a href="#teapot">teapot</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 428</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This is used to indicate the the request must be conditional. This
response is intended to prevent the 'lost update' problem, where a
client GETs a resource's state, modifies it and PUTs it back to the
server, when meanwhile a third party has modified the state on the
server, leading to a conflict.</p>
<pre class="prettyprint source lang-ts"><code>import { preconditionFailed } from 'remix-response';
export async function action() {
  return preconditionFailed({
    error: Promise.resolve('Missing If-Match header.'),
  });
};
</code></pre></dd>
<dt><a href="#preconditionRequired">preconditionRequired</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 429</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This is used to indacate the user has sent too many requests in a
given amount of time (&quot;rate limiting&quot;).</p>
<pre class="prettyprint source lang-ts"><code>import { tooManyRequests } from 'remix-response';
export async function action() {
  return tooManyRequests({
    retryIn: Promise.resolve(5 * 60 * 1000),
  });
};
</code></pre></dd>
<dt><a href="#tooManyRequests">tooManyRequests</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 500</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>The server has encountered a situation it does not know how to handle.</p>
<pre class="prettyprint source lang-ts"><code>import { serverError } from 'remix-response';
export async function loader() {
  throw serverError({
    error: Promise.resolve('Unable to load resouce.'),
  });
};
</code></pre></dd>
<dt><a href="#serverError">serverError</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 501</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This is used to indicate the server does not support the functionality
required to fulfill the request. This status can also send a
<code>Retry-After</code> header, telling the requester when to check back to see
if the functionality is supported by then.</p>
<pre class="prettyprint source lang-ts"><code>import { notImplemented } from 'remix-response';
export async function loader() {
  throw notImplemented({
    error: Promise.resolve('Unable to load resouce.'),
  }, {
    headers: { 'Retry-After': 300 }
  });
};
</code></pre></dd>
<dt><a href="#notImplemented">notImplemented</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 503</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>The server is not ready to handle the request. Common causes are a
server that is down for maintenance or that is overloaded. This
response should be used for temporary conditions and the
<code>Retry-After</code> HTTP header should, if possible, contain the
estimated time before the recovery of the service. This is used to
indicate the server does not support the functionality</p>
<pre class="prettyprint source lang-ts"><code>import { serviceUnavailable } from 'remix-response';
export async function loader() {
  throw serviceUnavailable({
    error: Promise.resolve('Unable to load resouce.'),
  }, {
    headers: { 'Retry-After': 300 }
  });
};
</code></pre></dd>
</dl>

## Constants

<dl>
<dt><a href="#ok">ok</a></dt>
<dd><p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 200</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This works similar to <code>Promise.all([])</code>, but takes an object
instead of an array for its promises argument</p>
<pre class="prettyprint source lang-ts"><code>import { ok } from 'remix-response';
export const loader = async () => {
  return ok({
    hello: 'world',
    promise: Promise.resolve('result'),
  });
};
</code></pre></dd>
</dl>

<a name="ok"></a>

## ok
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 201</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<pre class="prettyprint source lang-ts"><code>import { created } from 'remix-response';
export const action = async () => {
  return created({
    status: 'new',
    id: Promise.resolve(1),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="created"></a>

## created
<p>This is a shortcut for creating a responses with <code>status: 204</code>.</p>
<pre class="prettyprint source lang-ts"><code>import { created } from 'remix-response';
export const action = async () => {
  return noContent();
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="noContent"></a>

## noContent
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 205</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<pre class="prettyprint source lang-ts"><code>import { resetContent } from 'remix-response';
export const loader = async () => {
  return resetContent({
    form: {},
    id: Promise.resolve(1),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="resetContent"></a>

## resetContent
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 206</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<pre class="prettyprint source lang-ts"><code>import { partialContent } from 'remix-response';
export const loader = async () => {
  return partialContent({
    title: 'RFC 2616 - Hypertext Transfer Protocol -- HTTP/1.1',
    id: Promise.resolve(2616),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="partialContent"></a>

## partialContent
<p>This is a shortcut for creating a redirect response with <code>status: 301</code>. The provided string will be set as the location header in the
response.</p>
<p>This should be used when the URL of the requested resource has been
changed permanently. Browsers will cache this redirect.</p>
<pre class="prettyprint source lang-ts"><code>import { movedPermanently } from 'remix-response';
export const loader = async () => {
  return movedPermanently('https://www.example.com/');
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| url | <p>A url to redirect the request to</p> |

<a name="movedPermanently"></a>

## movedPermanently
<p>This is a shortcut for creating a redirect response with <code>status: 302</code>. The provided string will be set as the location header in the
response.</p>
<p>This should be used when the URI of requested resource has been
changed temporarily. Browsers will not cache this redirectly and it
is commonly used in action functions.</p>
<pre class="prettyprint source lang-ts"><code>import { found } from 'remix-response';
export const action = async () => {
  return found('https://www.example.com/');
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| url | <p>A url to redirect the request to</p> |

<a name="found"></a>

## found
<p>This is a shortcut for creating a redirect response with <code>status: 303</code>. The provided string will be set as the location header in the
response.</p>
<p>This indicates that the redirects don't link to the requested
resource itself, but to another page (such as a confirmation page,
a representation of a real-world object or an upload-progress
page). This response code is often sent back as a result of PUT or
POST. The method used to display this redirected page is always
GET.</p>
<pre class="prettyprint source lang-ts"><code>import { seeOther } from 'remix-response';
export const action = async () => {
  return seeOther('https://www.example.com/');
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| url | <p>A url to redirect the request to</p> |

<a name="seeOther"></a>

## seeOther
<p>This is a shortcut for creating a redirect response with <code>status: 304</code>. The provided string will be set as the location header in the
response.</p>
<p>This is used for caching purposes. It tells the client that the
response has not been modified, so the client can continue to use
the same cached version of the response.</p>
<pre class="prettyprint source lang-ts"><code>import { notModified } from 'remix-response';
export const loader = async ({ request }: LoaderArgs) => {
  if (request.headers.get('If-Modified-Since') === 'Wed, 21 Oct 2015 07:28:00 GMT') {
    return notModified(request.url);
  }
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| url | <p>A url to redirect the request to</p> |

<a name="notModified"></a>

## notModified
<p>This is a shortcut for creating a redirect response with <code>status: 307</code>. The provided string will be set as the location header in the
response.</p>
<p>This should be used to direct the client to get the requested
resource at another URI with the same method that was used in the
prior request. This has the same semantics as the <code>302 Found</code> HTTP
response code, with the exception that the user agent must not
change the HTTP method used: if a <code>POST</code> was used in the first
request, a <code>POST</code> must be used in the second request.</p>
<pre class="prettyprint source lang-ts"><code>import { temporaryRedirect } from 'remix-response';
export const action = async () => {
  return temporaryRedirect('https://www.example.com/');
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| url | <p>A url to redirect the request to</p> |

<a name="temporaryRedirect"></a>

## temporaryRedirect
<p>This is a shortcut for creating a redirect response with <code>status: 308</code>. The provided string will be set as the location header in the
response.</p>
<p>This means that the resource is now permanently located at another
URI. This has the same semantics as the <code>301 Moved Permanently</code> HTTP
response code, with the exception that the user agent must not
change the HTTP method used: if a <code>POST</code> was used in the first
request, a <code>POST</code> must be used in the second request.</p>
<pre class="prettyprint source lang-ts"><code>import { permanentRedirect } from 'remix-response';
export const action = async () => {
  return permanentRedirect('https://www.example.com/');
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| url | <p>A url to redirect the request to</p> |

<a name="permanentRedirect"></a>

## permanentRedirect
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 400</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used when the action cannot or will not process the
request due to something that is perceived to be a client error.</p>
<pre class="prettyprint source lang-ts"><code>import type { ActionArgs } from &quot;@remix-run/node&quot;;
import { badRequest } from 'remix-response';
export async function action({ request }: ActionArgs) {
  return badRequest({
    form: request.formData(),
    errors: Promise.resolve({name: 'missing'}),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="badRequest"></a>

## badRequest
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 401</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used when the action cannot or will not process the
request because the user is unauthenticated.</p>
<p>Although the HTTP standard specifies &quot;unauthorized&quot;, semantically
this response means &quot;unauthenticated&quot;. That is, the client must
authenticate itself to get the requested response.</p>
<pre class="prettyprint source lang-ts"><code>import type { ActionArgs } from &quot;@remix-run/node&quot;;
import { unauthorized } from 'remix-response';
export async function action({ request }: ActionArgs) {
  return unauthorized({
    form: request.formData(),
    errors: Promise.resolve({user: 'missing'}),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="unauthorized"></a>

## unauthorized
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 403</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used when the action cannot or will not process the
request because the user does not have access rights to the
content; that is, it is unauthorized, so the server is refusing to
give the requested resource. Unlike <code>401 Unauthorized</code>, the client's
identity is known to the server.</p>
<pre class="prettyprint source lang-ts"><code>import type { ActionArgs } from &quot;@remix-run/node&quot;;
import { forbidden } from 'remix-response';
export async function action({ request }: ActionArgs) {
  return forbidden({
    form: request.formData(),
    errors: Promise.resolve({user: 'missing'}),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="forbidden"></a>

## forbidden
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 404</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used when the loader find the requested resource. In
the browser, this means the URL is not recognized and the brower
will not suggest the URL as an autocomplete option int he future</p>
<pre class="prettyprint source lang-ts"><code>import { notFound } from 'remix-response';
export async function loader() {
  return notFound({
    recommendations: []
    fromTheBlog: Promise.resolve([]),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="notFound"></a>

## notFound
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 405</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used when the request method is known by the server
but is not supported by the target resource. For example, an API
may not allow calling DELETE to remove a resource.</p>
<pre class="prettyprint source lang-ts"><code>import { methodNotAllowed } from 'remix-response';
export async function action() {
  return methodNotAllowed({
    allowedMethods: Promise.resolve(['GET', 'POST']),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="methodNotAllowed"></a>

## methodNotAllowed
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 406</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This indicates that the server cannot produce a response matching
the list of acceptable values defined in the request's proactive
content negotiation headers, and that the server is unwilling to
supply a default representation.</p>
<p>Proactive content negotiation headers include: <code>Accept</code>, <code>Accept-Encoding</code>, <code>Accept-Language</code>.</p>
<p>In practice, this error is very rarely used. Instead of responding
using this error code, which would be cryptic for the end user and
difficult to fix, servers ignore the relevant header and serve an
actual page to the user. It is assumed that even if the user won't
be completely happy, they will prefer this to an error code.</p>
<p>If a server returns such an error status, the body of the message
should contain the list of the available representations of the
resources, allowing the user to choose among them.</p>
<pre class="prettyprint source lang-ts"><code>import { notAcceptable } from 'remix-response';
export async function action() {
  return notAcceptable({
    allowedLanguage: Promise.resolve(['US_en', 'US_es']),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="notAcceptable"></a>

## notAcceptable
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 409</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used to indicate aa request conflicts with the
current state of the server.</p>
<pre class="prettyprint source lang-ts"><code>import { conflict } from 'remix-response';
export async function action() {
  return conflict({
    error: Promise.resolve({ id: 'duplicate id' }),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="conflict"></a>

## conflict
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 410</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used when a resource has been permanently deleted
from server, with no forwarding address. Clients are expected to
remove their caches and links to the resource.</p>
<pre class="prettyprint source lang-ts"><code>import { gone } from 'remix-response';
export async function action() {
  return gone({
    error: Promise.resolve('resource deleted'),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="gone"></a>

## gone
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 412</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used to indicated the client sent preconditions in
its headers (usually <code>If-Unmodified-Since</code> or <code>If-None-Match</code>) which
the server does not meet.</p>
<pre class="prettyprint source lang-ts"><code>import { preconditionFailed } from 'remix-response';
export async function action() {
  return preconditionFailed({
    modifiedSince: Promise.resolve(Date.now()),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="preconditionFailed"></a>

## preconditionFailed
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 417</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This should be used to indicated the expectation indicated by the
<code>Expect</code> request header field cannot be met by the server.</p>
<pre class="prettyprint source lang-ts"><code>import { expectationFailed } from 'remix-response';
export async function action() {
  return expectationFailed({
    error: Promise.resolve('Content-Length is too large.'),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="expectationFailed"></a>

## expectationFailed
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 418</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>The server refuses the attempt to brew coffee with a teapot.</p>
<pre class="prettyprint source lang-ts"><code>import { teapot } from 'remix-response';
export async function action() {
  return teapot({
    error: Promise.resolve('🚫☕'),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="teapot"></a>

## teapot
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 428</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This is used to indicate the the request must be conditional. This
response is intended to prevent the 'lost update' problem, where a
client GETs a resource's state, modifies it and PUTs it back to the
server, when meanwhile a third party has modified the state on the
server, leading to a conflict.</p>
<pre class="prettyprint source lang-ts"><code>import { preconditionFailed } from 'remix-response';
export async function action() {
  return preconditionFailed({
    error: Promise.resolve('Missing If-Match header.'),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="preconditionRequired"></a>

## preconditionRequired
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 429</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This is used to indacate the user has sent too many requests in a
given amount of time (&quot;rate limiting&quot;).</p>
<pre class="prettyprint source lang-ts"><code>import { tooManyRequests } from 'remix-response';
export async function action() {
  return tooManyRequests({
    retryIn: Promise.resolve(5 * 60 * 1000),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="tooManyRequests"></a>

## tooManyRequests
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 500</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>The server has encountered a situation it does not know how to handle.</p>
<pre class="prettyprint source lang-ts"><code>import { serverError } from 'remix-response';
export async function loader() {
  throw serverError({
    error: Promise.resolve('Unable to load resouce.'),
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="serverError"></a>

## serverError
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 501</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This is used to indicate the server does not support the functionality
required to fulfill the request. This status can also send a
<code>Retry-After</code> header, telling the requester when to check back to see
if the functionality is supported by then.</p>
<pre class="prettyprint source lang-ts"><code>import { notImplemented } from 'remix-response';
export async function loader() {
  throw notImplemented({
    error: Promise.resolve('Unable to load resouce.'),
  }, {
    headers: { 'Retry-After': 300 }
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="notImplemented"></a>

## notImplemented
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 503</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>The server is not ready to handle the request. Common causes are a
server that is down for maintenance or that is overloaded. This
response should be used for temporary conditions and the
<code>Retry-After</code> HTTP header should, if possible, contain the
estimated time before the recovery of the service. This is used to
indicate the server does not support the functionality</p>
<pre class="prettyprint source lang-ts"><code>import { serviceUnavailable } from 'remix-response';
export async function loader() {
  throw serviceUnavailable({
    error: Promise.resolve('Unable to load resouce.'),
  }, {
    headers: { 'Retry-After': 300 }
  });
};
</code></pre>

**Kind**: global variable  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |

<a name="ok"></a>

## ok
<p>This is a shortcut for creating <code>application/json</code> responses with
<code>status: 200</code>. Converts <code>data</code> into JSON when all the given
promises have been fulfilled. The serialized JSON body is an object
that has the same key names as the promises object argument. If any
of the values in the object are not promises, they will simply be
copied over to the fulfilled object.</p>
<p>This works similar to <code>Promise.all([])</code>, but takes an object
instead of an array for its promises argument</p>
<pre class="prettyprint source lang-ts"><code>import { ok } from 'remix-response';
export const loader = async () => {
  return ok({
    hello: 'world',
    promise: Promise.resolve('result'),
  });
};
</code></pre>

**Kind**: global constant  

| Param | Description |
| --- | --- |
| data | <p>A JavaScript object that will be serialized as JSON.</p> |
| init? | <p>An optional RequestInit configuration object.</p> |


<!--DOCS_END-->
