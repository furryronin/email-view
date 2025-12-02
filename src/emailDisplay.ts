import { EmailData } from './api'

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    return date.toLocaleString()
  } catch {
    return dateString
  }
}

function renderEmail(email: EmailData, index: number, total: number): string {
  return `
    <div class="border border-gray-200 rounded-lg p-6 ${index < total - 1 ? 'mb-6' : ''}">
      <div class="max-w-3xl mx-auto  border-b border-gray-200 pb-4 mb-4">
        <div class="space-y-2 text-sm text-gray-600">
          <div>
            <span class="font-semibold">Subject:</span> ${escapeHtml(email.subject || '(No Subject)')}
          </div>
          <div>
            <span class="font-semibold">To:</span> ${escapeHtml(email.to)}
          </div>
          <div>
            <span class="font-semibold">Date:</span> ${formatDate(email.date)}
          </div>
        </div>
      </div>
      
      ${email.attachments && email.attachments.length > 0 ? `
        <div class=" pb-4 mb-4">
          <h3 class="font-semibold text-gray-900 mb-2">Attachments:</h3>
          <ul class="list-disc list-inside space-y-1">
            ${email.attachments.map(att => `
              <li class="text-sm text-gray-600">${escapeHtml(att.filename)} (${escapeHtml(att.contentType)})</li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      
      <div class="prose max-w-none">
        ${email.html ? `
          <div class="email-html-content">${email.html}</div>
        ` : email.text ? `
          <div class="whitespace-pre-wrap text-gray-800">${escapeHtml(email.text)}</div>
        ` : `
          <p class="text-gray-500 italic">No content available</p>
        `}
      </div>
    </div>
  `
}

export function displayEmails(emails: EmailData[]) {
  const container = document.getElementById('email-container')!
  
  if (emails.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8">
        <p class="text-gray-500">No emails found in inbox</p>
      </div>
    `
    return
  }

  container.innerHTML = `
    <div class="space-y-6">
      ${emails.map((email, index) => renderEmail(email, index, emails.length)).join('')}
    </div>
  `
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

