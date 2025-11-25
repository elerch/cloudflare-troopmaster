# Troopmaster Cloudflare worker

Allows for a site to use Troopmaster without having to redirect to the site
and lose Google-foo.

The worker does a few things:

* Does a server-side rather than client-side-after-the-fact https redirection
* On a home page load, will insert a tracking image so that troopmaster
  cookies can be established for login
* On a home page load, will insert the home page content and remove the
  Javascript on the page that tries to get it after the fact
* Serves static assets from the `/static` directory

If login gets "broken", its because the origin HTML has changed and the regexs
need adjustment. There are http headers that tell you if this is happening.

Broken here would mean that clicking login forces you through the multiple
drop downs to select site.

## Configuration

Update your `wrangler.toml` file with your Troopmaster site details:

```toml
name = "your-worker-name"
account_id = "your-cloudflare-account-id"
compatibility_date = "2025-11-25"

routes = [
  { pattern = "yoursite.org/*", zone_id = "your-zone-id" },
  { pattern = "*.yoursite.org/*", zone_id = "your-zone-id" }
]

[assets]
directory = "./static"
binding = "ASSETS"

[vars]
TMSITEID = "your-troopmaster-site-id"
TMSITENAME = "YourSiteName"
```

### Example Configuration (troop618.org)

```toml
name = "troop618"
account_id = "c7221b4e158b0c8f6009a627d5a6a41d"
compatibility_date = "2025-11-25"

routes = [
  { pattern = "troop618.org/*", zone_id = "62922e2b7c3bb7baee2d472943cfd594" },
  { pattern = "*.troop618.org/*", zone_id = "62922e2b7c3bb7baee2d472943cfd594" }
]

[assets]
directory = "./static"
binding = "ASSETS"

[vars]
TMSITEID = "203232"
TMSITENAME = "Troop618"
```

## Adding Static Routes

To serve static content from specific paths:

1. Place your files in the `/static` directory matching the URL structure
   - Example: `/static/tree/index.html` serves at `/tree` or `/tree/`

2. Add the route check in `src/index.js` in the `handleRequest` function:
   ```javascript
   if (url.pathname.startsWith('/your-path')) {
     return env.ASSETS.fetch(request);
   }
   ```

3. Add additional path checks as needed for each static route

## Development

### Prerequisites
- Node.js (v24 or later recommended)
- Cloudflare account with Workers enabled

### Install Dependencies
```bash
npm install
```

### Local Development
```bash
npx wrangler dev
```

This starts a local server that mimics the Cloudflare Workers environment.

## Deployment

### Manual Deployment
```bash
npx wrangler deploy
```

### Automated Deployment (GitHub)

1. Go to your Cloudflare dashboard → Workers & Pages
2. Create a new Worker from your GitHub repository
3. Configure the following:
   - Production branch: `main` (or your default branch)
   - Build command: (leave empty)
   - Build output directory: (leave empty)
4. Add environment variables in the Cloudflare dashboard if needed
5. Every push to your configured branch will automatically deploy

### CI/CD with GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm install
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

Add `CLOUDFLARE_API_TOKEN` to your repository secrets.
