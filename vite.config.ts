import { defineConfig } from 'vite'
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export default defineConfig({
  base: './', // Use relative paths for subfolder deployment
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    // Ensure CSP-compliant build (no eval)
    target: 'es2015',
    minify: 'esbuild', // Use esbuild instead of terser for better CSP compliance
    rollupOptions: {
      output: {
        // Use format that doesn't require eval
        format: 'es',
        // Ensure no eval is used
        generatedCode: {
          constBindings: true,
        },
      },
    },
    // Disable source maps in production to avoid any eval-like code
    sourcemap: false,
  },
  plugins: [
    {
      name: 'copy-php-api',
      closeBundle() {
        // Copy PHP API file to dist/api directory
        const apiDir = join(process.cwd(), 'dist', 'api')
        mkdirSync(apiDir, { recursive: true })
        
        const phpSource = join(process.cwd(), 'api', 'emails.php')
        if (!existsSync(phpSource)) {
          return
        }

        let phpContent = readFileSync(phpSource, 'utf8')

        // Optionally hydrate IMAP credentials from local .env into dist PHP
        // so the .env file itself never needs to be uploaded.
        const envPath = join(process.cwd(), '.env')
        if (existsSync(envPath)) {
          const envVars: Record<string, string> = {}
          const lines = readFileSync(envPath, 'utf8').split('\n')
          for (const raw of lines) {
            const line = raw.trim()
            if (!line || line.startsWith('#') || !line.includes('=')) continue
            const [key, ...rest] = line.split('=')
            envVars[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '')
          }

          const replaceDefine = (name: string, value: string) => {
            const escaped = value.replace(/'/g, "\\'")
            const pattern = new RegExp(`define\\('${name}',\\s*[^)]*\\);`)
            const replacement = `define('${name}', '${escaped}');`
            phpContent = phpContent.replace(pattern, replacement)
          }

          if (envVars.IMAP_USER) replaceDefine('IMAP_USER', envVars.IMAP_USER)
          if (envVars.IMAP_PASSWORD) replaceDefine('IMAP_PASSWORD', envVars.IMAP_PASSWORD)
          if (envVars.IMAP_HOST) replaceDefine('IMAP_HOST', envVars.IMAP_HOST)
          if (envVars.IMAP_PORT) {
            const pattern = new RegExp(`define\\('IMAP_PORT',\\s*[^)]*\\);`)
            phpContent = phpContent.replace(pattern, `define('IMAP_PORT', ${parseInt(envVars.IMAP_PORT, 10) || 993});`)
          }
          if (envVars.IMAP_TLS) {
            const boolVal = envVars.IMAP_TLS.toLowerCase() === 'false' ? 'false' : 'true'
            const pattern = new RegExp(`define\\('IMAP_TLS',\\s*[^)]*\\);`)
            phpContent = phpContent.replace(pattern, `define('IMAP_TLS', ${boolVal});`)
          }
          if (envVars.EMAIL_COUNT) {
            const pattern = new RegExp(`define\\('EMAIL_COUNT',\\s*[^)]*\\);`)
            phpContent = phpContent.replace(pattern, `define('EMAIL_COUNT', ${parseInt(envVars.EMAIL_COUNT, 10) || 5});`)
          }
        }

        writeFileSync(join(apiDir, 'emails.php'), phpContent, 'utf8')
        console.log('✅ Copied PHP API to dist/api/emails.php')
        
        // Create .htaccess file for CSP headers
        const distDir = join(process.cwd(), 'dist')
        const htaccessContent = `<IfModule mod_headers.c>
    Header always set Content-Security-Policy "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self';"
    Header unset Content-Security-Policy
    Header set Content-Security-Policy "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self';"
</IfModule>
`
        writeFileSync(join(distDir, '.htaccess'), htaccessContent, 'utf8')
        console.log('✅ Created .htaccess file in dist/')
      },
    },
  ],
})
