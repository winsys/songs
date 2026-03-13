<?php

/**
 * Main Ajax class
 * Uses trait-based architecture to organize functions by page/feature
 */
class Ajax
{
    // Include all trait files
    use Ajax_Common;    // Common functions used across multiple pages
    use Ajax_Tech;      // Tech page functions
    use Ajax_Sermon;    // Sermon page functions
    use Ajax_Settings;  // Settings page functions
    use Ajax_Import;    // Import page functions

    private static $args;

    /**
     * AJAX ENGINE
     */
    public static function execute($cmd)
    {
        $command = $cmd['command'];
        if( !isset($_SESSION['userId']) ){
            return json_encode(array('status'=>false, 'message'=>'User not logged in!'));
        }

        // [SECURITY #3] CSRF-проверка для всех команд
        if (!Security::validateCsrf()) {
            http_response_code(403);
            return json_encode(['status' => false, 'message' => 'CSRF token mismatch']);
        }

        if (is_callable(array('Ajax', $command))){
            self::$args = $cmd;
            $data = self::$command();
            return $data;
        }else{
            return json_encode(array('status'=>false, 'message'=>Info::get('db')->errors()));
        }
    }
}
