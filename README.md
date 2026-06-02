# Email Viewer

A static HTML page that dynamically displays the latest 5 emails from an IMAP inbox. Built with Vite, TypeScript, and Tailwind CSS.

## Features

- Displays the latest 5 emails from an IMAP inbox
- Beautiful, responsive UI built with Tailwind CSS
- TypeScript for type safety
- PHP backend for IMAP connections (works on any LAMP server)
- Static frontend files that can be hosted anywhere

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

3. For local development, you can create a `.env` file (optional). For production, you'll configure credentials directly in the PHP file (see Deployment section).

### Gmail Setup

If you're using Gmail, you'll need to:
1. Enable 2-Step Verification
2. Generate an App Password:
   - Go to your Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
   - Use this password in your `.env` file

## Development

Run the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

**Note:** For local development, you'll need a PHP server. You can use PHP's built-in server:
```bash
# In a separate terminal, after building:
npm run build
php -S localhost:8000 -t dist
```

Then the API will be available at `http://localhost:8000/api/emails.php`

## Building

Build for production:
```bash
npm run build
```

This creates a `dist` folder containing:
- `index.html` - Main HTML file
- `assets/` - JavaScript and CSS files
- `api/emails.php` - PHP backend script

## Deployment to LAMP Server

1. Build the project:
```bash
npm run build
```

2. Upload the contents of the `dist` folder to your web server's document root (e.g., `/var/www/html/` or `public_html/`)

3. **Configure IMAP credentials** by editing `api/emails.php` on your server. Open the file and update the `define()` statements at the top:
```php
define('IMAP_USER', 'your-email@example.com');
define('IMAP_PASSWORD', 'your-app-password');
define('IMAP_HOST', 'imap.gmail.com');
define('IMAP_PORT', 993);
define('IMAP_TLS', true);
define('EMAIL_COUNT', 5);
```

   **Security Note:** The credentials are stored directly in the PHP file. Make sure:
   - The file has proper permissions (644)
   - Never commit the configured file to version control
   - Keep backups secure

4. Ensure PHP has the `imap` extension enabled:
```bash
# On Ubuntu/Debian
sudo apt-get install php-imap
sudo phpenmod imap

# Restart Apache
sudo systemctl restart apache2
```

5. Set proper file permissions:
```bash
chmod 644 api/emails.php
```

## PHP Requirements

- PHP 7.4 or higher
- PHP IMAP extension enabled
- File permissions to read `api/emails.php`

## Project Structure

```
email-view/
├── src/                    # Frontend source code
│   ├── main.ts            # App entry point
│   ├── api.ts             # API client
│   ├── emailDisplay.ts    # Email rendering
│   └── style.css          # Tailwind styles
├── api/
│   └── emails.php         # PHP backend for IMAP
├── dist/                  # Build output (generated)
│   ├── index.html
│   ├── assets/
│   └── api/
│       └── emails.php
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

## License

ISC
