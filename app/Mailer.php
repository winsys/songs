<?php

/**
 * Mailer — outgoing email via authenticated SMTP (PHPMailer), the same
 * transport as the WinSys Support portal (see support/src/Mailer.php).
 *
 * SMTP parameters are read from config.php:
 *   'smtp' => [
 *       'host'       => 'smtp.hostinger.com',
 *       'port'       => 465,
 *       'username'   => 'support@winsys.lv',
 *       'password'   => '…',
 *       'encryption' => 'ssl',            // ssl | tls | ''
 *       'from_email' => 'support@winsys.lv',
 *       'from_name'  => 'Worship Songs',
 *   ]
 *
 * Fail-soft: when the smtp section or PHPMailer is missing, falls back to
 * PHP mail(); returns false on any failure (logged via error_log).
 */
class Mailer
{
    /** Send a plain-text UTF-8 email. Returns true when accepted for delivery. */
    public static function send(string $to, string $subject, string $body): bool
    {
        if (empty($to)) {
            return false;
        }

        $config   = Info::get('config');
        $conf     = isset($config['smtp']) && is_array($config['smtp']) ? $config['smtp'] : null;
        $autoload = __DIR__ . '/../vendor/autoload.php';

        if ($conf && !empty($conf['host']) && is_readable($autoload)) {
            require_once $autoload;
            try {
                $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
                $mail->isSMTP();
                $mail->Host    = $conf['host'];
                $mail->Port    = (int)($conf['port'] ?? 465);
                $mail->CharSet = 'UTF-8';
                $mail->Timeout = 15;

                if (!empty($conf['username'])) {
                    $mail->SMTPAuth = true;
                    $mail->Username = $conf['username'];
                    $mail->Password = (string)($conf['password'] ?? '');
                }

                $enc = strtolower((string)($conf['encryption'] ?? ''));
                if ($enc === 'ssl') {
                    $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
                } elseif ($enc === 'tls') {
                    $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
                } else {
                    $mail->SMTPSecure  = false;
                    $mail->SMTPAutoTLS = false;
                }

                $mail->setFrom($conf['from_email'], $conf['from_name'] ?? 'Worship Songs');
                $mail->addAddress($to);
                $mail->isHTML(false);
                $mail->Subject = $subject;
                $mail->Body    = $body;

                $mail->send();
                return true;
            } catch (\Throwable $e) {
                error_log("Mailer::send (smtp) failed to={$to}: " . $e->getMessage());
                return false;
            }
        }

        // Fallback: local sendmail via mail() (environments without SMTP config)
        $headers = "MIME-Version: 1.0\r\n"
                 . "Content-Type: text/plain; charset=UTF-8\r\n"
                 . "Content-Transfer-Encoding: 8bit\r\n"
                 . "From: Worship Songs <no-reply@winsys.lv>\r\n";
        return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);
    }
}
