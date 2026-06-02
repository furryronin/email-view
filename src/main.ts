import './style.css'
import { fetchEmails } from './api'
import { displayEmails } from './emailDisplay'

async function init() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  
  app.innerHTML = `
    <div class="min-h-screen bg-gray-100 py-8 px-4">
      <div class="max-w-4xl mx-auto">
        <div class="flex items-center justify-between mb-6 gap-4">
          <h1 class="text-3xl font-bold text-gray-900">Latest Emails</h1>
          <button id="refresh-button" class="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            <span>Refresh</span>
          </button>
        </div>
        <div id="email-container" class="bg-white rounded-lg shadow-lg p-6">
          <div class="text-center py-8">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p class="mt-4 text-gray-600">Loading emails...</p>
          </div>
        </div>
      </div>
    </div>
  `

  // Refresh button applies a cache-buster query param and reloads the page
  const refreshButton = document.getElementById('refresh-button')
  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      const cacheBuster = Array.from(crypto.getRandomValues(new Uint8Array(5)))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
      const url = new URL(window.location.href)
      url.searchParams.set('cb', cacheBuster)
      window.location.href = url.toString()
    })
  }

  try {
    const response = await fetchEmails()
    console.log('API Response:', response)
    
    if (response.emails && response.emails.length > 0) {
      displayEmails(response.emails)
    } else {
      const container = document.getElementById('email-container')!
      const debugInfo = (response as any).debug 
        ? `<p class="text-xs text-gray-400 mt-2">Debug: Found ${(response as any).debug.emailsFound} emails, attempted to fetch ${(response as any).debug.emailsToFetch}</p>`
        : ''
      container.innerHTML = `
        <div class="text-center py-8">
          <p class="text-gray-500">${response.message || 'No emails found'}</p>
          ${debugInfo}
        </div>
      `
    }
  } catch (error) {
    console.error('Error fetching emails:', error)
    const container = document.getElementById('email-container')!
    container.innerHTML = `
      <div class="bg-red-50 border border-red-200 rounded-lg p-4">
        <h2 class="text-red-800 font-semibold mb-2">Error loading emails</h2>
        <p class="text-red-600">${error instanceof Error ? error.message : 'Unknown error occurred'}</p>
      </div>
    `
  }
}

init()


