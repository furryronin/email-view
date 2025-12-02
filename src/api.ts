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
  try {
    const response = await fetch('/.netlify/functions/getLatestEmail')
    
    // Check if response is HTML (likely means function isn't available)
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/html')) {
      throw new Error('Netlify Functions are not available. Please run "npm run dev" (which uses netlify dev) instead of "npm run dev:vite" to run functions locally.')
    }
    
    if (!response.ok) {
      let errorData
      try {
        const text = await response.text()
        // Try to parse as JSON
        errorData = JSON.parse(text)
      } catch {
        // If response isn't JSON, create a generic error
        errorData = { 
          message: `Server error: ${response.status} ${response.statusText}` 
        }
      }
      
      const errorMessage = errorData.message || `HTTP error! status: ${response.status}`
      
      // Provide more helpful error messages
      if (response.status === 502) {
        throw new Error('Function timeout or server error. Please check your IMAP settings and try again.')
      } else if (response.status === 500) {
        throw new Error(errorMessage || 'Server error occurred. Please check the function logs.')
      } else {
        throw new Error(errorMessage)
      }
    }
    
    return response.json()
  } catch (error) {
    // Re-throw with more context if it's a network error
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to connect to the server. Please check your connection.')
    }
    // Re-throw JSON parse errors with helpful message
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      throw new Error('Invalid response from server. Make sure you are running "npm run dev" (not "npm run dev:vite") to enable Netlify Functions.')
    }
    throw error
  }
}

