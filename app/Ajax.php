<?php

class Ajax
{
    private static $args;

    private static function get_song_list()
    {
        $list = Info::get('db')->select("select *, concat(num, '   ',name) as dispName from song_list");
        return json_encode($list);
    }

    private static function add_to_favorites()
    {
        Info::get('db')->exec("insert into favorites (SONGID) values (".mysqli_escape_string(Info::get('dbh'), self::$args['id']).")");
        return '';
    }

    private static function get_favorites()
    {
        $sql = "SELECT f.ID as FID, l.*, concat(l.num, ' - ',l.name) as dispName, concat('/images/',l.num, '.jpg') as imageName FROM favorites f left join song_list l ON l.ID=f.SONGID ORDER BY FID";
        $list = Info::get('db')->select($sql);
        return json_encode($list);
    }

    private static function clear_favorites()
    {
        $sql = "DELETE FROM favorites";
        Info::get('db')->exec($sql);
        return '';
    }

    private static function delete_favorite_item()
    {
        $sql = "DELETE FROM favorites WHERE ID=".self::$args['id'];
        Info::get('db')->exec($sql);
        return '';
    }


    private static function set_image()
    {
        Info::get('db')->exec("insert into current (image) values ('/images/".mysqli_escape_string(Info::get('dbh'), self::$args['image_num']).".jpg')");
        return '';
    }

    private static function get_image()
    {
        $img = Info::get('db')->select("select image from current");
        return json_encode($img);
    }


    private static function clear_image()
    {
        Info::get('db')->exec("delete from current");
        return '';
    }


    /**
     * AJAX ENGINE
     */
    public static function execute($cmd)
    {
        $command = $cmd['command'];
        if (is_callable(array('Ajax', $command))){
            self::$args = $cmd;
            $data = self::$command();
            return $data;
        }else{
            return json_encode(array('status'=>false, 'message'=>Info::get('db')->errors()));
        }
    }
}