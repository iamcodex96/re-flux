/**
 * Build a GitHub Pages 404 document that maps clean SPA paths to the app's
 * hash-router URLs. Assets and unknown paths containing file extensions are
 * left untouched so missing static files do not redirect into the application.
 */
export function createGithubPagesRouteFallbackHtml(basePath) {
  const base = normalizeBasePath(basePath);
  const redirectScript = `(function () {
  var base = ${JSON.stringify(base)};
  var pathname = window.location.pathname;
  var routePath;
  if (pathname === base.slice(0, -1)) {
    window.location.replace(base + window.location.search + window.location.hash);
    return;
  }
  if (pathname === base) return;
  if (pathname.indexOf(base) === 0) {
    routePath = pathname.slice(base.length);
  } else if (base === '/') {
    routePath = pathname.replace(/^\\/+/, '');
  } else {
    return;
  }
  var segments = routePath.split('/').filter(Boolean);
  if (!segments.length || segments.some(function (segment) { return segment.indexOf('.') !== -1; })) return;
  var route = '/' + segments.join('/');
  window.location.replace(base + '#' + route + window.location.search + window.location.hash);
})();`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>Redirecting to re;Flux</title>
    <script>${redirectScript}</script>
  </head>
  <body>
    <p>Opening the requested re;Flux page…</p>
  </body>
</html>
`;
}

function normalizeBasePath(basePath) {
  const base = typeof basePath === 'string' && basePath ? basePath : '/';
  if (base === '/') return '/';
  return `/${base.split('/').filter(Boolean).join('/')}/`;
}
