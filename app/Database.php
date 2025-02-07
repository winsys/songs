<?php

class Database
{
    private $f_handle;
    private $errors = 'none';

    public function __construct()
    {
        $conf = Info::get('config');
        $ii = mysqli_init();
        mysqli_options($ii, MYSQLI_READ_DEFAULT_FILE, '/etc/mysql/mysql.conf.d/mysqld.cnf');

        if (mysqli_real_connect(
            $ii,
            $conf['db']['host'],
            $conf['db']['login'],
            $conf['db']['pass'],
            $conf['db']['database'],
            $conf['db']['port'],
            '/var/run/mysqld/mysqld.sock' ))
        {
            $this->f_handle = $ii;
            $this->f_handle->set_charset("utf8");
            $this->error = '';
        } else $this->error = mysqli_connect_error();
    }

    public function select($q)
    {
        $res = $this->f_handle->query($q);
        $result = array();
        while ($rec = $res->fetch_array(MYSQLI_ASSOC))
        {
            $result[] = $rec;
        }
        return $result;
    }

    public function get($q)
    {
        $res = $this->f_handle->query($q);
        $rec = $res->fetch_array();
        return $rec;
    }


    public function getValue($q)
    {
        $res = $this->f_handle->query($q);
        if ($res) {
            $rec = $res->fetch_array();
        }else{
            return 0;
        }
        return $rec[0];
    }

    public function exec($sql)
    {
        $this->f_handle->query($sql);
        return true;
    }

    public function db_handle()
    {
        return $this->f_handle;
    }

    public function errors()
    {
        return $this->errors;
    }

    public function safeStr($src){
        return $this->f_handle->real_escape_string($src);
    }

    private function log($msg)
    {
        file_put_contents('./db_getvalue.log', $msg.PHP_EOL, FILE_APPEND);
    }

}