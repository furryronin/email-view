<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

// ============================================================================
// IMAP CONFIGURATION
// ============================================================================
// Edit the values below with your IMAP credentials
// IMPORTANT: Keep this file secure and never commit it to version control
// ============================================================================

define('IMAP_USER', 'your-email@example.com');
define('IMAP_PASSWORD', 'your-app-password');
define('IMAP_HOST', 'imap.gmail.com');
define('IMAP_PORT', 993);
define('IMAP_TLS', true);
define('EMAIL_COUNT', 5); // Number of emails to display

// ============================================================================
// END CONFIGURATION
// ============================================================================

// Get configuration from constants
$imapUser = IMAP_USER;
$imapPassword = IMAP_PASSWORD;
$imapHost = IMAP_HOST;
$imapPort = IMAP_PORT;
$imapTLS = IMAP_TLS;
$emailCount = EMAIL_COUNT;

if (empty($imapUser) || $imapUser === 'your-email@example.com' || empty($imapPassword) || $imapPassword === 'your-app-password') {
    http_response_code(500);
    echo json_encode(['message' => 'IMAP credentials not configured. Please edit the define() statements at the top of api/emails.php with your IMAP credentials.']);
    exit;
}

// Check if IMAP extension is available
if (!function_exists('imap_open')) {
    http_response_code(500);
    echo json_encode(['message' => 'PHP IMAP extension is not installed. Please install php-imap extension.']);
    exit;
}

try {
    // Connect to IMAP server
    $mailbox = '{' . $imapHost . ':' . $imapPort . ($imapTLS ? '/ssl' : '') . '}INBOX';
    $connection = @imap_open($mailbox, $imapUser, $imapPassword);
    
    if (!$connection) {
        $error = imap_last_error();
        throw new Exception('Failed to connect to IMAP server: ' . ($error ?: 'Unknown error'));
    }
    
    // Search for all emails (prefer UIDs; fall back to sequence numbers)
    $useUid = true;
    $emails = @imap_search($connection, 'ALL', SE_UID);
    
    if (!$emails || count($emails) === 0) {
        $lastError = imap_last_error();
        // Fallback without UID flag in case the server doesn't support UID search
        $emails = @imap_search($connection, 'ALL');
        $useUid = false;
    }
    
    if (!$emails || count($emails) === 0) {
        imap_close($connection);
        echo json_encode(['emails' => [], 'message' => 'No emails found in inbox' . (isset($lastError) && $lastError ? ' (IMAP: ' . $lastError . ')' : '')]);
        exit;
    }
    
    // Get the latest 5 emails (reverse array to get newest first)
    rsort($emails);
    $uidsToFetch = array_slice($emails, 0, min(5, count($emails)));
    
    $emailData = [];
    $parseErrors = [];
    
    foreach ($uidsToFetch as $uid) {
        try {
            // Convert UID to sequence number if needed
            // imap_headerinfo doesn't work well with FT_UID flag, so we convert UIDs to sequence numbers
            $seqNum = $uid;
            if ($useUid) {
                $seqNum = @imap_msgno($connection, $uid);
                if (!$seqNum) {
                    $error = imap_last_error();
                    $parseErrors[] = "Email UID $uid: Could not convert to sequence number - " . ($error ?: 'Unknown error');
                    continue;
                }
            }
            
            // Fetch email header using sequence number
            $header = @imap_headerinfo($connection, $seqNum);
            
            if (!$header) {
                $error = imap_last_error();
                $parseErrors[] = "Email " . ($useUid ? "UID $uid (seq $seqNum)" : "seq $seqNum") . ": Failed to fetch header - " . ($error ?: 'Unknown error');
                continue;
            }
            
            // Fetch email body and structure using sequence number
            // Note: We use sequence numbers for all operations, even if we found emails by UID
            $body = @imap_body($connection, $seqNum);
            $structure = @imap_fetchstructure($connection, $seqNum);
            
            // Extract text and HTML parts
            $text = '';
            $html = '';
            $attachments = [];
            
            if (isset($structure->parts) && is_array($structure->parts)) {
                foreach ($structure->parts as $partNum => $part) {
                    $partNumber = $partNum + 1;
                    $partData = @imap_fetchbody($connection, $seqNum, $partNumber);
                    
                    // Decode the part
                    if (isset($part->encoding)) {
                        switch ($part->encoding) {
                            case 3: // BASE64
                                $partData = base64_decode($partData);
                                break;
                            case 4: // QUOTED-PRINTABLE
                                $partData = quoted_printable_decode($partData);
                                break;
                        }
                    }
                    
                    // Get content type
                    $contentType = 'text/plain';
                    if (isset($part->type)) {
                        switch ($part->type) {
                            case 0: // TEXT
                                if (isset($part->subtype)) {
                                    $contentType = 'text/' . strtolower($part->subtype);
                                }
                                break;
                            case 3: // APPLICATION
                                $contentType = 'application/octet-stream';
                                break;
                            case 4: // MESSAGE
                                $contentType = 'message/rfc822';
                                break;
                            case 5: // AUDIO
                                $contentType = 'audio/basic';
                                break;
                            case 6: // IMAGE
                                $contentType = 'image/jpeg';
                                break;
                            case 7: // VIDEO
                                $contentType = 'video/mpeg';
                                break;
                        }
                    }
                    
                    // Check for text/html or text/plain
                    if (isset($part->subtype)) {
                        $subtype = strtolower($part->subtype);
                        if ($subtype === 'html') {
                            $html = $partData;
                        } elseif ($subtype === 'plain') {
                            $text = $partData;
                        }
                    }
                    
                    // Check for attachments
                    if (isset($part->disposition) && strtolower($part->disposition) === 'attachment') {
                        $filename = '';
                        if (isset($part->dparameters) && is_array($part->dparameters)) {
                            foreach ($part->dparameters as $param) {
                                if (strtolower($param->attribute) === 'filename') {
                                    $filename = $param->value;
                                    break;
                                }
                            }
                        }
                        if (empty($filename) && isset($part->parameters) && is_array($part->parameters)) {
                            foreach ($part->parameters as $param) {
                                if (strtolower($param->attribute) === 'name') {
                                    $filename = $param->value;
                                    break;
                                }
                            }
                        }
                        $attachments[] = [
                            'filename' => $filename ?: 'unnamed',
                            'contentType' => $contentType
                        ];
                    }
                }
            } else {
                // Simple email without multipart - check structure type
                if ($structure) {
                    // Check if it's HTML or plain text
                    if (isset($structure->subtype)) {
                        $subtype = strtolower($structure->subtype);
                        if ($subtype === 'html') {
                            $html = $body;
                        } else {
                            $text = $body;
                        }
                    } else {
                        $text = $body;
                    }
                    
                    // Decode if needed
                    if (isset($structure->encoding)) {
                        switch ($structure->encoding) {
                            case 3: // BASE64
                                $text = base64_decode($text);
                                $html = base64_decode($html);
                                break;
                            case 4: // QUOTED-PRINTABLE
                                $text = quoted_printable_decode($text);
                                $html = quoted_printable_decode($html);
                                break;
                        }
                    }
                } else {
                    // Fallback: just use the body as text
                    $text = $body;
                }
            }
            
            // Get email metadata
            $from = 'Unknown';
            if (isset($header->from) && is_array($header->from) && count($header->from) > 0) {
                $fromObj = $header->from[0];
                $fromName = isset($fromObj->personal) ? $fromObj->personal . ' ' : '';
                $mailbox = isset($fromObj->mailbox) ? $fromObj->mailbox : '';
                $host = isset($fromObj->host) ? $fromObj->host : '';
                if ($mailbox && $host) {
                    $from = $fromName . $mailbox . '@' . $host;
                } elseif (isset($header->fromaddress)) {
                    $from = $header->fromaddress;
                }
            } elseif (isset($header->fromaddress)) {
                $from = $header->fromaddress;
            }
            
            $to = 'Unknown';
            if (isset($header->to) && is_array($header->to) && count($header->to) > 0) {
                $toObj = $header->to[0];
                $toName = isset($toObj->personal) ? $toObj->personal . ' ' : '';
                $mailbox = isset($toObj->mailbox) ? $toObj->mailbox : '';
                $host = isset($toObj->host) ? $toObj->host : '';
                if ($mailbox && $host) {
                    $to = $toName . $mailbox . '@' . $host;
                } elseif (isset($header->toaddress)) {
                    $to = $header->toaddress;
                }
            } elseif (isset($header->toaddress)) {
                $to = $header->toaddress;
            }
            
            $subject = isset($header->subject) ? $header->subject : '(No Subject)';
            $date = isset($header->date) ? date('c', strtotime($header->date)) : date('c');
            
            $emailData[] = [
                'subject' => $subject,
                'from' => $from,
                'to' => $to,
                'date' => $date,
                'text' => !empty($text) ? $text : null,
                'html' => !empty($html) ? $html : null,
                'attachments' => !empty($attachments) ? $attachments : null,
            ];
            
        } catch (Exception $e) {
            $parseErrors[] = "Email $uid: Exception - " . $e->getMessage();
            error_log("Error fetching email $uid: " . $e->getMessage());
            continue;
        }
    }
    
    imap_close($connection);
    
    // Return response with debug info if no emails were parsed
    $response = [
        'emails' => $emailData,
        'count' => count($emailData)
    ];
    
    // Add debug info if no emails found but search returned results
    if (count($emailData) === 0 && count($uidsToFetch) > 0) {
        $response['debug'] = [
            'emailsFound' => count($emails),
            'emailsToFetch' => count($uidsToFetch),
            'useUid' => $useUid,
            'lastImapError' => imap_last_error(),
            'parseErrors' => $parseErrors
        ];
    } elseif (count($parseErrors) > 0) {
        // Include parse errors even if some emails were successfully parsed
        $response['debug'] = [
            'parseErrors' => $parseErrors
        ];
    }
    
    echo json_encode($response);
    
} catch (Exception $e) {
    if (isset($connection) && $connection) {
        @imap_close($connection);
    }
    http_response_code(500);
    echo json_encode(['message' => $e->getMessage()]);
}
