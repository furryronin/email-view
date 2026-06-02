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
    // Cache buster to avoid aggressive hosting caches
    const cacheBuster = Array.from(crypto.getRandomValues(new Uint8Array(5)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')

    // Use relative path for subfolder deployment
    const response = await fetch(`api/emails.php?cb=${cacheBuster}`)
    
    if (!response.ok) {
      let errorData
      try {
        const text = await response.text()
        errorData = JSON.parse(text)
      } catch {
        errorData = { 
          message: `Server error: ${response.status} ${response.statusText}` 
        }
      }
      
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    
    // Log debug info if available
    if (data.debug) {
      console.log('API Debug Info:', data.debug)
    }
    
    return data
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to connect to the server. Please check your connection.')
    }
    throw error
  }
}
