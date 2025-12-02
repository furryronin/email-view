# Email Viewer

A web application that displays the content from the latest email in an IMAP email inbox. Built with Vite, TypeScript, and Tailwind CSS.

## Features

- Fetches and displays the latest emails from an IMAP inbox (configurable count)
- Beautiful, responsive UI built with Tailwind CSS
- TypeScript for type safety
- Deployed on Netlify with serverless functions

## Setup

1. Clone the repository:
```bash
git clone <your-repo-url>
cd email-view
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your IMAP settings:
```env
IMAP_USER=your-email@example.com
IMAP_PASSWORD=your-app-password
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_TLS=true

# Number of emails to display (default: 1, max: 50)
EMAIL_COUNT=1
```

### Gmail Setup

If you're using Gmail, you'll need to:
1. Enable 2-Step Verification
2. Generate an App Password:
   - Go to your Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
   - Use this password in your `.env` file

### Other Email Providers

For other email providers, adjust the `IMAP_HOST` and `IMAP_PORT` accordingly:
- **Outlook/Hotmail**: `outlook.office365.com`, port `993`
- **Yahoo**: `imap.mail.yahoo.com`, port `993`
- **Custom IMAP**: Use your provider's IMAP server settings

## Development

Run the development server with Netlify Functions support:
```bash
npm run dev
```

This will start both the Vite dev server and Netlify Functions locally. The app will be available at `http://localhost:8888` (Netlify Dev's default port, which proxies to Vite on port 5173).

**Note:** Make sure you have a `.env` file with your IMAP credentials set up for local development. The functions will use these environment variables.

If you only want to run the frontend without functions (for UI development):
```bash
npm run dev:vite
```

The app will be available at `http://localhost:5173`, but API calls will fail since functions won't be available.

## Building

Build for production:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Deployment to Netlify

1. Push your code to GitHub
2. Connect your repository to Netlify
3. Set the following environment variables in Netlify:
   - `IMAP_USER`
   - `IMAP_PASSWORD`
   - `IMAP_HOST` (optional, defaults to `imap.gmail.com`)
   - `IMAP_PORT` (optional, defaults to `993`)
   - `IMAP_TLS` (optional, defaults to `true`)
   - `EMAIL_COUNT` (optional, defaults to `1`, max: `50`)
4. Deploy!

The Netlify function will automatically be deployed and available at `/.netlify/functions/getLatestEmail`

## Project Structure

```
email-view/
├── src/
│   ├── main.ts          # Main application entry point
│   ├── api.ts           # API client for fetching emails
│   ├── emailDisplay.ts  # Email display logic
│   └── style.css        # Tailwind CSS styles
├── netlify/
│   └── functions/
│       └── getLatestEmail.ts  # Netlify serverless function
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── netlify.toml
```

## License

ISC

