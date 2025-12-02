import './style.css'
import { fetchEmails } from './api'
import { displayEmails } from './emailDisplay'

async function init() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  
  app.innerHTML = `
    <div class="min-h-screen bg-gray-100 py-8 px-4">
      <div class="max-w-3xl mx-auto">
        <h1 class="text-3xl font-bold text-gray-900 mb-6">Subscription Inbox</h1>
        <div id="email-container" class="bg-white rounded-lg shadow-lg p-6">
          <div class="text-center py-8">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p class="mt-4 text-gray-600">Loading emails...</p>
          </div>
        </div>
      </div>
    </div>
  `

  try {
    const response = await fetchEmails()
    if (response.emails && response.emails.length > 0) {
      displayEmails(response.emails)
    } else {
      const container = document.getElementById('email-container')!
      container.innerHTML = `
        <div class="text-center py-8">
          <p class="text-gray-500">${response.message || 'No emails found'}</p>
        </div>
      `
    }
  } catch (error) {
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

