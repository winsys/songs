<?php

class Security {

    private $db;

    public function __construct()
    {
        $this->db = Info::get('db');
    }

    public static function isLoggedIn(){
        return isset($_SESSION['loggedIn']) && $_SESSION['loggedIn'] === true;
    }

    public static function loginRequest(){
        return isset($_GET['login']) && isset($_GET['pass']);
    }

    public static function doLogin()
    {
        $db    = Info::get('db');
        $login = $db->db_handle()->real_escape_string($_GET['login']);
        $pass  = $db->db_handle()->real_escape_string($_GET['pass']);
        $user  = $db->get("SELECT * FROM users WHERE login=\"{$login}\" and pass=\"{$pass}\"");

        if (count($user) > 0) {
            $_SESSION['loggedIn']   = true;
            $_SESSION['userName']   = $user['NAME'];
            // userId = GROUP_ID (shared across all users in the group)
            $_SESSION['userId']     = isset($user['GROUP_ID']) && $user['GROUP_ID'] > 0
                ? (int)$user['GROUP_ID']
                : (int)$user['ID'];
            $_SESSION['userRole']   = isset($user['ROLE']) ? $user['ROLE'] : 'musician';
            $_SESSION['loginError'] = '';
            return true;
        } else {
            $_SESSION['loggedIn']   = false;
            $_SESSION['loginError'] = 'Invalid credentials';
            return false;
        }
    }

    public static function getRole()
    {
        return isset($_SESSION['userRole']) ? $_SESSION['userRole'] : 'musician';
    }

    public static function isAdmin()    { return self::getRole() === 'admin'; }
    public static function isLeader()   { return self::getRole() === 'leader'; }
    public static function isMusician() { return self::getRole() === 'musician'; }
    public static function isPreacher() { return self::getRole() === 'preacher'; }

    /**
     * Allowed routes per role.
     * All roles can access 'index' and 'ajax'.
     */
    private static $roleRoutes = array(
        'admin'    => null,  // null = unrestricted
        'leader'   => array('index', 'ajax', 'leader', 'tech'),
        'musician' => array('index', 'ajax', 'musician'),
        'preacher' => array('index', 'ajax', 'sermon_prep', 'sermon'),
    );

    public static function canAccess($route)
    {
        $role = self::getRole();
        if ($role === 'admin') return true;

        $allowed = isset(self::$roleRoutes[$role])
            ? self::$roleRoutes[$role]
            : array('index', 'ajax');
        return in_array($route, $allowed);
    }

    /**
     * All roles land on /index/ — buttons are filtered there by role.
     */
    public static function defaultRedirect()
    {
        return '/index/' . $_SESSION['userId'];
    }

    public function doLogout()
    {
        unset($_SESSION['loggedIn']);
        unset($_SESSION['userName']);
        unset($_SESSION['userId']);
        unset($_SESSION['userRole']);
        unset($_SESSION['loginError']);
    }

    public function userInfo($field)
    {
        if ($this->userLoggedIn()) {
            return $_SESSION['user_info'][$field];
        }
        return false;
    }

    public function userLoggedIn()
    {
        return isset($_SESSION['loggedIn']) && $_SESSION['loggedIn'];
    }
}