export interface EmailData {
  subject: string
  from: string
  to: string
  date: string
  text?: string
  html?: string
  attachments?: Array<{
    filename: string
    contentType: string
  }>
}

export interface EmailsResponse {
  emails: EmailData[]
  count?: number
  message?: string
}

export async function fetchEmails(): Promise<EmailsResponse> {
  const response = await fetch('/.netlify/functions/getLatestEmail')
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch emails' }))
    throw new Error(error.message || `HTTP error! status: ${response.status}`)
  }
  
  return response.json()
}

