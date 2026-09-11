/** The public shell contains no admin data; noindex applies even without JS. */
export function adminShell(html) {
  if (!/<title>[^<]*<\/title>/.test(html) || !/<meta name="robots" content="[^"]*"\s*\/>/.test(html))
    throw new Error('Admin shell needs the verified application HTML metadata.');
  return html
    .replace(/<title>[^<]*<\/title>/, '<title>Admin Console | LIEUVA</title>')
    .replace(/<meta name="robots" content="[^"]*"\s*\/>/, '<meta name="robots" content="noindex,nofollow,noarchive" />')
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, '<link rel="canonical" href="https://lieuva.com/admin/overview" />')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
}
