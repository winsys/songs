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
        $db = Info::get('db');
        $login = $db->db_handle()->real_escape_string($_GET['login']);
        $pass = $db->db_handle()->real_escape_string($_GET['pass']);
        $user = $db->get("SELECT * FROM users WHERE login=\"{$login}\" and pass=\"{$pass}\"");

        if( count($user) > 0 )
        {
            $_SESSION['loggedIn'] = true;
            $_SESSION['userName'] = $user['NAME'];
            $_SESSION['userId'] = $user['ID'];
            $_SESSION['loginError'] = '';
            var_dump($_SESSION);
            return true;
        } else {
            $_SESSION['loggedIn'] = false;
            $_SESSION['loginError'] = 'Invalid credentials';
            var_dump($_SESSION);
            return false;
        }
    }


    public function doLogout()
    {
        unset($_SESSION['loggedIn']);
        unset($_SESSION['userName']);
        unset($_SESSION['userId']);
        unset($_SESSION['loginError']);
    }

    public function userInfo($field)
    {
        if ($this->userLoggedIn()) {
            return $_SESSION['user_info'][$field];
        } else {
            return false;
        }
    }


    public function userLoggedIn()
    {
        return isset($_SESSION['loggedIn']) && $_SESSION['loggedIn'];
    }




}
