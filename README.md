# Troopmaster Cloudflare worker

Allows for a site to use Troopmaster without having to redirect to the site
and lose Google-foo.

The worker does a few things:

* Does a server-side rather than client-side-after-the-fact https redirection
* On a home page load, will insert a tracking image so that troopmaster
  cookies can be established for login
* On a home page load, will insert the home page content and remove the
  Javascript on the page that tries to get it after the fact

If login gets "broken", its because the origin HTML has changed and the regexs
need adjustment. There are http headers that tell you if this is happening.

Broken here would mean that clicking login forces you through the multiple
drop downs to select site.

This section should be in your wrangler.toml file. Replace with the correct
values of course.

```toml
[vars]
TMSITEID = "203232"
TMSITENAME = "Troop618"
```
