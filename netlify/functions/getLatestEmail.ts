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
      connTimeout: 10000, // 10 second connection timeout
      authTimeout: 5000,  // 5 second auth timeout
    })

    // Set a timeout for the connection
    const connectionTimeout = setTimeout(() => {
      imap.end()
      reject(new Error('IMAP connection timeout'))
    }, 15000) // 15 second total timeout

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
    const fetch = imap.fetch([uid], { bodies: '' })
    let emailBuffer = Buffer.alloc(0)
    let messageReceived = false
    
    fetch.on('message', (msg) => {
      msg.on('body', (stream) => {
        stream.on('data', (chunk: Buffer) => {
          emailBuffer = Buffer.concat([emailBuffer, chunk])
        })
      })
      
      msg.once('end', () => {
        messageReceived = true
        resolve(emailBuffer)
      })
    })
    
    fetch.once('error', (err) => {
      reject(err)
    })
    
    fetch.once('end', () => {
      if (!messageReceived || emailBuffer.length === 0) {
        reject(new Error('No email data received'))
      }
    })
  })
}

async function fetchMultipleEmails(imap: Imap, uids: number[]): Promise<Buffer[]> {
  if (uids.length === 0) {
    return []
  }

  // Fetch emails sequentially to ensure proper ordering
  const emailBuffers: Buffer[] = []
  
  for (const uid of uids) {
    try {
      const buffer = await fetchEmail(imap, uid)
      emailBuffers.push(buffer)
    } catch (error) {
      console.error(`Error fetching email ${uid}:`, error)
      // Continue with other emails even if one fails
    }
  }
  
  return emailBuffers
}

export const handler: Handler = async (event, context) => {
  let imap: Imap | null = null

  try {
    // Log for debugging (will appear in Netlify function logs)
    console.log('Function invoked')
    console.log('EMAIL_COUNT from env:', process.env.EMAIL_COUNT)
    
    const emailCount = parseInt(process.env.EMAIL_COUNT || '1', 10)
    const maxEmails = Math.min(Math.max(1, emailCount), 50) // Limit between 1 and 50
    
    console.log(`Parsed emailCount: ${emailCount}, maxEmails: ${maxEmails}`)

    console.log('Connecting to IMAP...')
    imap = await connectToImap()
    console.log('IMAP connected, opening inbox...')
    
    await openInbox(imap)
    console.log('Inbox opened, searching emails...')
    
    const results = await searchLatestEmails(imap)
    console.log(`Found ${results.length} emails`)
    
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
    
    const emailBuffers = await fetchMultipleEmails(imap, uidsToFetch)
    console.log(`Fetched ${emailBuffers.length} email buffers`)

    const emails = await Promise.all(
      emailBuffers.map(async (buffer) => {
        const parsed = await simpleParser(buffer)
        return {
          subject: parsed.subject || '(No Subject)',
          from: parsed.from?.text || 'Unknown',
          to: parsed.to?.text || 'Unknown',
          date: parsed.date?.toISOString() || new Date().toISOString(),
          text: parsed.text || undefined,
          html: parsed.html || undefined,
          attachments: parsed.attachments?.map(att => ({
            filename: att.filename || 'unnamed',
            contentType: att.contentType || 'application/octet-stream',
          })),
        }
      })
    )

    // Reverse the array to show latest emails first (newest to oldest)
    const emailsReversed = emails.reverse()

    if (imap) {
      imap.end()
    }

    console.log(`Successfully processed ${emailsReversed.length} emails (newest first)`)
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

