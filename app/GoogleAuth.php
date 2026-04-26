<?php

/**
 * Google OAuth handler.
 * Extracted from App.php — handles all Google authentication flows:
 *   - OAuth flow initiation (initiateLogin)
 *   - login callback processing (handleLoginCallback)
 *   - Google One Tap processing (handleOneTapLogin)
 *   - linking a Google account to an existing user (handleAccountLinking)
 */
class GoogleAuth
{
    // =========================================================
    //  Public entry points (called from App::selectRoute)
    // =========================================================

    public static function initiateLogin(): void
    {
        $clientId = Info::get('config')['GOOGLE_CLIENT_ID'] ?? '';
        if (!$clientId) {
            self::renderError('Google OAuth is not configured.', '/login', 'Back to sign in');
            return;
        }

        $params = http_build_query([
            'client_id'     => $clientId,
            'redirect_uri'  => self::getLoginCallbackUri(),
            'response_type' => 'code',
            'scope'         => 'openid email profile',
            'access_type'   => 'online',
            'prompt'        => 'select_account',
        ]);

        header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . $params);
    }

    public static function handleLoginCallback(): void
    {
        $code = $_GET['code'] ?? '';
        if (!$code) {
            self::renderError('No authorization code received from Google.', '/login', 'Back to sign in');
            return;
        }

        $clientId     = Info::get('config')['GOOGLE_CLIENT_ID']     ?? '';
        $clientSecret = Info::get('config')['GOOGLE_CLIENT_SECRET'] ?? '';
        if (!$clientId || !$clientSecret) {
            self::renderError('Google OAuth is not configured.', '/login', 'Back to sign in');
            return;
        }

        // Exchange authorization code for access token
        $tokenJson = self::exchangeCodeForToken($code, $clientId, $clientSecret);
        if (!isset($tokenJson['access_token'])) {
            self::renderError('Failed to obtain an access token from Google.', '/login', 'Back to sign in');
            return;
        }

        // Fetch user profile from Google
        $userInfo = self::fetchGoogleUserInfo($tokenJson['access_token']);
        if (!isset($userInfo['id'])) {
            self::renderError('Failed to fetch user information from Google.', '/login', 'Back to sign in');
            return;
        }

        $user = self::findUserByGoogleId($userInfo['id']);
        if (!$user) {
            self::renderError(
                'Your Google account (<strong>' . htmlspecialchars($userInfo['email'] ?? '') . '</strong>) '
                . 'is not linked to any user in this system.<br>'
                . 'Sign in with username and password, then link your Google account in Settings.',
                '/login',
                'Back to sign in'
            );
            return;
        }

        Security::startUserSession($user);
        self::renderSuccessPage($user['NAME'], Security::defaultRedirect());
    }

    public static function handleOneTapLogin(): void
    {
        $credential = $_POST['credential'] ?? '';
        if (!$credential) {
            echo json_encode(['error' => 'No credential provided']);
            return;
        }

        $clientId = Info::get('config')['GOOGLE_CLIENT_ID'] ?? '';
        if (!$clientId) {
            echo json_encode(['error' => 'Google OAuth not configured']);
            return;
        }

        // Decode JWT (header.payload.signature)
        $parts = explode('.', $credential);
        if (count($parts) !== 3) {
            echo json_encode(['error' => 'Invalid credential format']);
            return;
        }

        $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
        if (!$payload) {
            echo json_encode(['error' => 'Failed to decode credential']);
            return;
        }

        if (($payload['aud'] ?? '') !== $clientId) {
            echo json_encode(['error' => 'Invalid audience']);
            return;
        }

        if (isset($payload['exp']) && $payload['exp'] < time()) {
            echo json_encode(['error' => 'Token expired']);
            return;
        }

        $googleId = $payload['sub'] ?? '';
        if (!$googleId) {
            echo json_encode(['error' => 'No Google ID in token']);
            return;
        }

        $user = self::findUserByGoogleId($googleId);
        if (!$user) {
            self::renderError(
                'Your Google account (<strong>' . htmlspecialchars($payload['email'] ?? '') . '</strong>) '
                . 'is not linked to any user in this system.<br>'
                . 'Sign in with username and password, then link your Google account in Settings.',
                '/login',
                'Back to sign in'
            );
            return;
        }

        Security::startUserSession($user);
        self::renderSuccessPage($user['NAME'], Security::defaultRedirect());
    }

    public static function handleAccountLinking(): void
    {
        if (!Security::isLoggedIn()) {
            self::renderError(
                'You must be signed in to link a Google account.',
                '/login',
                'Sign in'
            );
            return;
        }

        $code = $_GET['code'] ?? '';
        if (!$code) {
            self::renderError('No authorization code received from Google.', '/settings', 'Back to settings');
            return;
        }

        $result     = Ajax::execute(['command' => 'handle_google_callback', 'code' => $code]);
        $resultData = json_decode($result, true);

        if ($resultData && $resultData['status'] === 'ok') {
            $email = htmlspecialchars($resultData['google_email'] ?? '');
            echo '<!DOCTYPE html>
<html>
<head>
    <title>Google Account Linked</title>
    <meta http-equiv="refresh" content="3;url=/settings">
</head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>✅ Success</h2>
    <p>Your Google account has been linked.</p>
    <p>Email: <strong>' . $email . '</strong></p>
    <p>Redirecting to Settings in 3 seconds…</p>
    <p><a href="/settings">Continue now</a></p>
</body>
</html>';
        } else {
            $errorMsg = htmlspecialchars($resultData['message'] ?? 'Unknown error');
            self::renderError($errorMsg, '/settings', 'Back to settings');
        }
    }

    // =========================================================
    //  Private helpers
    // =========================================================

    /**
     * Find a user by Google ID: first checks user_google_accounts,
     * then falls back to the legacy GOOGLE_ID column in users (migration compatibility).
     */
    private static function findUserByGoogleId(string $googleId): ?array
    {
        $db        = Info::get('db');
        $safeId    = mysqli_real_escape_string(Info::get('dbh'), $googleId);

        $googleAccount = $db->get(
            "SELECT user_id FROM user_google_accounts WHERE google_id = '{$safeId}'"
        );

        if (!$googleAccount) {
            // Fallback: legacy column (migration compatibility)
            return $db->get(
                "SELECT ID, NAME, ROLE, GROUP_ID FROM users WHERE GOOGLE_ID = '{$safeId}'"
            );
        }

        $userId = (int)$googleAccount['user_id'];
        $user   = $db->get(
            "SELECT ID, NAME, ROLE, GROUP_ID FROM users WHERE ID = {$userId}"
        );

        // Update last_used timestamp
        $db->exec(
            "UPDATE user_google_accounts SET last_used = NOW() WHERE google_id = '{$safeId}'"
        );

        return $user ?: null;
    }

    /**
     * Get the Google OAuth callback URI for login.
     */
    private static function getLoginCallbackUri(): string
    {
        $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        return $scheme . '://' . $_SERVER['HTTP_HOST'] . '/google-login-callback';
    }

    /**
     * Exchange an authorization code for a Google access token.
     */
    private static function exchangeCodeForToken(string $code, string $clientId, string $clientSecret): array
    {
        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
            'code'          => $code,
            'client_id'     => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri'  => self::getLoginCallbackUri(),
            'grant_type'    => 'authorization_code',
        ]));
        $response = curl_exec($ch);
        curl_close($ch);
        return json_decode($response, true) ?? [];
    }

    /**
     * Fetch user profile from Google using an access token.
     */
    private static function fetchGoogleUserInfo(string $accessToken): array
    {
        $ch = curl_init('https://www.googleapis.com/oauth2/v2/userinfo');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $accessToken]);
        $response = curl_exec($ch);
        curl_close($ch);
        return json_decode($response, true) ?? [];
    }

    /**
     * Render a simple HTML error page.
     * Used instead of repeating inline HTML strings.
     */
    private static function renderError(string $message, string $backUrl, string $backLabel): void
    {
        echo '<!DOCTYPE html>
<html>
<head><title>Authentication error</title></head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>❌ Error</h2>
    <p>' . $message . '</p>
    <p><a href="' . htmlspecialchars($backUrl) . '">' . htmlspecialchars($backLabel) . '</a></p>
</body>
</html>';
    }

    /**
     * Render a login success page with an instant redirect.
     */
    private static function renderSuccessPage(string $userName, string $redirectUrl): void
    {
        $safeName        = htmlspecialchars($userName);
        $safeRedirectUrl = htmlspecialchars($redirectUrl);
        echo '<!DOCTYPE html>
<html>
<head>
    <title>Sign-in successful</title>
    <script>window.location.href = "' . $safeRedirectUrl . '";</script>
    <meta http-equiv="refresh" content="0;url=' . $safeRedirectUrl . '">
</head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>✅ Signed in</h2>
    <p>Welcome, <strong>' . $safeName . '</strong>!</p>
    <p>Redirecting…</p>
</body>
</html>';
    }
}
