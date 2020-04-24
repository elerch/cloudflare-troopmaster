async function modifyBody(pageContentTextPromise, originalResponse) {
  // If you're wondering, yeah, this is incredibly brittle. I'm expecting
  // that troopmaster basically never changes. We're looking for the first
  // instance of "go get this content", which occurs during a document ready
  // only if we are on the home page
  const initialloadJs = /\$.ajax\([\s\S]*?WebSite\/GetContent[\s\S]*?}\);/m;

  // This one is easier. Look for the pageContent div
  const pageContentDiv = /<div id="pagecontent">[\s\S]*?<\/div>/m;

  // ...and the last one, we need to change the location for Login
  const login = /location.href = '\/Login\/Index\?website'/m;

  // const responseBodyText = originalResponse.body.text;
  let responseBodyText = await originalResponse.text();
  const extraheaders = {
    'X-worker-modification-status': 'original',
    'X-worker-version': '1.0',
  };
  if (responseBodyText.match(pageContentDiv)
      && responseBodyText.match(initialloadJs)
      && responseBodyText.match(login)) {
    // only replace things if all our brittleness is as expected. There is
    // only a performance and probable SEO hit if we don't enter this block
    const pageContentResponse = await pageContentTextPromise;
    if (pageContentResponse.ok) {
      // html comment added here so we can see that we've entered this block.
      // Also gives end user some idea were to go if something goes horribly
      // wrong

      // We need to make a request back to origin from the client so the
      // right cookies are setup over there just in case the client navigates
      // to login...wow, Troopmaster...
      //
      // So, the only way we can do that effectively is to basically use a
      // tracking pixel. The only endpoint that actually works for this, though,
      // is the /mysite/sitename endpoint, which returns HTML. So, the image
      // will be big, ugly, and contain two redirects. But...it's behind the
      // scenes and doesn't show anything visible, so, you know, YOLO...
      responseBodyText = responseBodyText.replace(pageContentDiv,
        `<div id="pagecontent">
          <!--edge side include via cf worker-->
          ${await pageContentResponse.text()}
          <!--invisible image to establish tm cookie. Note that troopmaster redirects this https to
              /Website/Home, then redirects again, explicitly to http. Since Troopmaste also
              doesn't respect CORS, our only way to establish a cookie for login is with this image
              tag that eventually will try to fetch an http resource, but we can't tell the browser
              here to avoid redirects (we don't want the "image", only the cookie). as if that's not
              enough, javascript on /Website/Home actually checks for http and does a
              **CLIENT SIDE REDIRECT BACK TO HTTPS**, resulting in a wild flash that we just
              avoid with a simple 302 (first in this worker, then back as a checkbox on the
              CloudFlare dashboard. Seriously, people...I don't know whether to laugh or cry -->
          <img src="https://tmweb.troopmaster.com/mysite/${TMSITENAME}?Home" height="1" width="1" style="opacity:0" >
          <!--end invisible image to establish tm cookie-->
          <!--End edge side include via cf worker-->
         </div>`);
      responseBodyText = responseBodyText.replace(initialloadJs, '');

      responseBodyText = responseBodyText.replace(login,
        `location.href = 'https://tmweb.troopmaster.com/Login/Index?website'`); // eslint-disable-line no-undef

      extraheaders['X-worker-modification-status'] = 'modified';
      extraheaders['X-worker-modification-getcontent-ok'] = 'true';
    } else {
      extraheaders['X-worker-modification-getcontent-ok'] = 'false';
    }
  } else {
    extraheaders['X-worker-modification-div'] = (!!responseBodyText.match(pageContentDiv)).toString();
    extraheaders['X-worker-modification-load'] = (!!responseBodyText.match(initialloadJs)).toString();
    extraheaders['X-worker-modification-location'] = (!!responseBodyText.match(login)).toString();
  }
  const response = new Response(responseBodyText, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers: originalResponse.headers,
  });
  Object.keys(extraheaders).forEach((k) => response.headers.set(k, extraheaders[k]));
  return response;
}

async function homePage(origin) {
  const data = {
    type: '',
    id: '',
    password: '',
    home: true,
  };
  return fetch(`${origin}/WebSite/GetContent`, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      Accept: '*/*',
      'User-Agent': 'troop618worker 1.0',
      Cookie: `TroopMasterWebSiteID=${TMSITEID}`, // eslint-disable-line no-undef
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Respond with whatever origin gives us
 * @param {Request} request
 */
async function handleRequest(request) {
  let response;
  try {
    // curl -b TroopMasterWebSiteID=203232  -v https://tmweb.troopmaster.com/Website/Home
    const origin = 'https://tmweb.troopmaster.com/Website/Home';
    const originHost = 'https://tmweb.troopmaster.com';
    const requestUrl = new URL(request.url)
    const requestPath = requestUrl.pathname;
    let originUrl = `${originHost}${requestPath}`;
    let home = null;
    // Cloudflare offers this as a checkbox
    // if (requestUrl.protocol === 'http:') {
    //   // The front-end has javascript to refresh the page after the whole
    //   // thing has been rendered, resulting in an ugly flash. We'll do the
    //   // redirect server (well, edge) side instead. Note this breaks debugging,
    //   // which we can fix later because deploys are so fast that we can
    //   // just YOLO our changes
    //   return Response.redirect(request.url.replace(/^http/, 'https'), 301);
    // }
    if (requestPath === '/' && request.method === 'GET') {
      originUrl = origin;
      home = homePage(originHost);
    }
    response = await fetch(originUrl, {
      method: request.method,
      body: request.body,
      headers: {
        'User-Agent': 'troop618worker 1.0',
        Cookie: `TroopMasterWebSiteID=${TMSITEID}`, // eslint-disable-line no-undef
        'Content-Type': request.headers.get('Content-Type') || 'text/html',
      },
    });
    if (home) {
      response = await modifyBody(home, response);
    }
  } catch (err) {
    // Without event.waitUntil(), our fetch() to our logging service may
    // or may not complete.
    // event.waitUntil(postLog(err));
    const stack = JSON.stringify(err.stack) || err;
    // Copy the response and initialize body to the stack trace
    response = new Response(stack, response);
    // Shove our rewritten URL into a header to find out what it was.
    response.headers.set('X-Debug-stack', stack);
    response.headers.set('X-Debug-err', err);
  }
  return response;
}
// This is "browser", but it's running in a V8 isolate, so it's really
// neither browser nor node. This is the hook into the CF Worker ecosystem,
// so we need to have this code and is safe to disable eslint for this line
addEventListener('fetch', (event) => { // eslint-disable-line no-restricted-globals
  event.respondWith(handleRequest(event.request));
});
