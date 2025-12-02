import { Handler } from '@netlify/functions'
import Imap from 'imap'
import { simpleParser } from 'mailparser'

interface ImapConfig {
  user: string
  password: string
  host: string
  port: number
  tls: boolean
}

function getImapConfig(): ImapConfig {
  return {
    user: process.env.IMAP_USER || '',
    password: process.env.IMAP_PASSWORD || '',
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    tls: process.env.IMAP_TLS !== 'false',
  }
}

function connectToImap(): Promise<Imap> {
  return new Promise((resolve, reject) => {
    const config = getImapConfig()
    
    if (!config.user || !config.password) {
      reject(new Error('IMAP credentials not configured. Please set IMAP_USER and IMAP_PASSWORD environment variables.'))
      return
    }

    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 5000,  // 5 second connection timeout (reduced for Netlify)
      authTimeout: 3000,  // 3 second auth timeout (reduced for Netlify)
      keepalive: false,  // Disable keepalive to close connection faster
    })

    // Set a timeout for the connection (reduced for Netlify free tier)
    const connectionTimeout = setTimeout(() => {
      imap.end()
      reject(new Error('IMAP connection timeout'))
    }, 8000) // 8 second total timeout (leaving 2 seconds for processing)

    imap.once('ready', () => {
      clearTimeout(connectionTimeout)
      resolve(imap)
    })

    imap.once('error', (err: Error) => {
      clearTimeout(connectionTimeout)
      reject(err)
    })

    imap.connect()
  })
}

function openInbox(imap: Imap): Promise<Imap.Box> {
  return new Promise((resolve, reject) => {
    imap.openBox('INBOX', false, (err, box) => {
      if (err) reject(err)
      else resolve(box)
    })
  })
}

function searchLatestEmails(imap: Imap): Promise<number[]> {
  return new Promise((resolve, reject) => {
    imap.search(['ALL'], (err, results) => {
      if (err) reject(err)
      else resolve(results)
    })
  })
}

function fetchEmail(imap: Imap, uid: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const fetchTimeout = setTimeout(() => {
      reject(new Error(`Timeout fetching email ${uid}`))
    }, 5000) // 5 second timeout per email
    
    const fetch = imap.fetch([uid], { bodies: '' })
    let emailBuffer = Buffer.alloc(0)
    let messageReceived = false
    
    fetch.on('message', (msg) => {
      msg.on('body', (stream) => {
        stream.on('data', (chunk: Buffer) => {
          emailBuffer = Buffer.concat([emailBuffer, chunk])
          // Limit email size to prevent memory issues (10MB max)
          if (emailBuffer.length > 10 * 1024 * 1024) {
            clearTimeout(fetchTimeout)
            reject(new Error(`Email ${uid} too large (max 10MB)`))
          }
        })
      })
      
      msg.once('end', () => {
        clearTimeout(fetchTimeout)
        messageReceived = true
        resolve(emailBuffer)
      })
    })
    
    fetch.once('error', (err) => {
      clearTimeout(fetchTimeout)
      reject(err)
    })
    
    fetch.once('end', () => {
      clearTimeout(fetchTimeout)
      if (!messageReceived || emailBuffer.length === 0) {
        reject(new Error('No email data received'))
      }
    })
  })
}

async function fetchMultipleEmails(imap: Imap, uids: number[], startTime: number, maxTime: number = 8000): Promise<Buffer[]> {
  if (uids.length === 0) {
    return []
  }

  const emailBuffers: Buffer[] = []
  
  // Always fetch the latest email first (most important)
  // uids are in ascending order, so last one is newest
  const latestUid = uids[uids.length - 1]
  try {
    const elapsed = Date.now() - startTime
    if (elapsed > maxTime) {
      console.log(`Time limit reached (${elapsed}ms), stopping email fetch`)
      return emailBuffers
    }
    
    const firstBuffer = await fetchEmail(imap, latestUid)
    emailBuffers.push(firstBuffer)
    console.log(`Fetched latest email (UID: ${latestUid}) in ${Date.now() - startTime}ms`)
  } catch (error) {
    console.error(`Error fetching latest email:`, error)
    // Return empty if we can't even get the first email
    return emailBuffers
  }
  
  // If we have more emails and time permits, fetch them one at a time
  // This ensures we get at least one email even if we timeout
  if (uids.length > 1 && (Date.now() - startTime) < maxTime) {
    const remainingUids = uids.slice(0, -1).reverse() // Reverse to get newest first
    
    for (const uid of remainingUids) {
      const elapsed = Date.now() - startTime
      if (elapsed > maxTime) {
        console.log(`Time limit reached (${elapsed}ms), stopping at ${emailBuffers.length} emails`)
        break
      }
      
      try {
        const buffer = await fetchEmail(imap, uid)
        emailBuffers.push(buffer)
        console.log(`Fetched email (UID: ${uid}) in ${Date.now() - startTime}ms`)
      } catch (error) {
        console.error(`Error fetching email ${uid}:`, error)
        // Continue with next email
      }
    }
  }
  
  return emailBuffers
}

export const handler: Handler = async (event, context) => {
  let imap: Imap | null = null
  const startTime = Date.now()

  try {
    // Log for debugging (will appear in Netlify function logs)
    console.log('Function invoked')
    console.log('EMAIL_COUNT from env:', process.env.EMAIL_COUNT)
    
    const emailCount = parseInt(process.env.EMAIL_COUNT || '1', 10)
    // For Netlify free tier, limit to 1 email to avoid timeouts
    // Can increase if on Pro tier or if connection is fast
    const maxEmails = Math.min(Math.max(1, emailCount), 1) // Temporarily limited to 1 for timeout issues
    
    console.log(`Parsed emailCount: ${emailCount}, maxEmails: ${maxEmails}`)

    console.log('Connecting to IMAP...')
    imap = await connectToImap()
    console.log(`IMAP connected in ${Date.now() - startTime}ms, opening inbox...`)
    
    await openInbox(imap)
    console.log(`Inbox opened in ${Date.now() - startTime}ms, searching emails...`)
    
    const results = await searchLatestEmails(imap)
    console.log(`Found ${results.length} emails in ${Date.now() - startTime}ms`)
    
    if (results.length === 0) {
      if (imap) {
        imap.end()
      }
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          emails: [],
          message: 'No emails found in inbox',
        }),
      }
    }

    // Get the latest N emails (results are sorted, last N are the latest)
    // Only fetch as many as are available (don't exceed results.length)
    const actualCount = Math.min(maxEmails, results.length)
    const uidsToFetch = results.slice(-actualCount)
    console.log(`Requested ${maxEmails} emails, found ${results.length} in inbox, fetching ${uidsToFetch.length} emails...`)
    
    // Pass startTime and maxTime (8 seconds) to ensure we return before timeout
    const emailBuffers = await fetchMultipleEmails(imap, uidsToFetch, startTime, 8000)
    console.log(`Fetched ${emailBuffers.length} email buffers in ${Date.now() - startTime}ms`)
    
    if (emailBuffers.length === 0) {
      if (imap) {
        imap.end()
      }
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          message: 'Failed to fetch any emails. This may be due to timeout or connection issues.',
        }),
      }
    }

    // Parse emails with timeout protection
    const parseEmail = async (buffer: Buffer) => {
      try {
        const parsed = await simpleParser(buffer)
        // Limit text/html content to prevent huge payloads
        const maxContentLength = 50000 // Limit to 50KB per email
        let text = parsed.text
        let html = parsed.html
        
        if (text && text.length > maxContentLength) {
          text = text.substring(0, maxContentLength) + '... (truncated)'
        }
        if (html && html.length > maxContentLength) {
          html = html.substring(0, maxContentLength) + '... (truncated)'
        }
        
        return {
          subject: parsed.subject || '(No Subject)',
          from: parsed.from?.text || 'Unknown',
          to: parsed.to?.text || 'Unknown',
          date: parsed.date?.toISOString() || new Date().toISOString(),
          text: text || undefined,
          html: html || undefined,
          attachments: parsed.attachments?.map(att => ({
            filename: att.filename || 'unnamed',
            contentType: att.contentType || 'application/octet-stream',
          })),
        }
      } catch (error) {
        console.error('Error parsing email:', error)
        return null
      }
    }

    const emails = (await Promise.all(
      emailBuffers.map(buffer => parseEmail(buffer))
    )).filter(email => email !== null) as Array<{
      subject: string
      from: string
      to: string
      date: string
      text?: string
      html?: string
      attachments?: Array<{ filename: string; contentType: string }>
    }>

    // Reverse the array to show latest emails first (newest to oldest)
    const emailsReversed = emails.reverse()

    if (imap) {
      imap.end()
    }

    const totalTime = Date.now() - startTime
    console.log(`Successfully processed ${emailsReversed.length} emails (newest first) in ${totalTime}ms`)
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        emails: emailsReversed,
        count: emailsReversed.length,
      }),
    }
  } catch (error) {
    console.error('Error in function:', error)
    
    if (imap) {
      try {
        imap.end()
      } catch (e) {
        console.error('Error closing IMAP connection:', e)
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('Returning error response:', errorMessage)

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? String(error) : undefined,
      }),
    }
  }
}

