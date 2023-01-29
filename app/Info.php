<?php

class Info
{
    private static $vars;

    public function offsetExists($offset)
    {
        return isset(self::$vars[$offset]);
    }

    public static function get($offset)
    {
        return isset(self::$vars[$offset]) ? self::$vars[$offset] : null;
    }

    public static function set($offset, $value)
    {
        if (is_null($offset))
        {
            self::$vars['no_offset'] = $value;
        }
        else
        {
            self::$vars[$offset] = $value;
        }
    }

    public static function delete($offset)
    {
        unset(self::$vars[$offset]);
    }

}
