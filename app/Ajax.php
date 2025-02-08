<?php

class Ajax
{
    private static $args;

    private static function get_song_list()
    {
        $list = Info::get('db')->select("select *, concat(NUM, '   ',NAME) as dispName from song_list where LISTID = ".self::$args['list_id']." order by NUM");
        return json_encode($list);
    }

    private static function add_to_favorites()
    {
        Info::get('db')->exec("insert into favorites (groupId, SONGID) values ({$_SESSION['userId']},".mysqli_escape_string(Info::get('dbh'), self::$args['id']).")");
        return '';
    }

    private static function add_to_piano_favorites()
    {
        Info::get('db')->exec("insert into piano_favorites (groupId, SONGID) values ({$_SESSION['userId']},".mysqli_escape_string(Info::get('dbh'), self::$args['id']).")");
        return '';
    }


    private static function get_favorites()
    {
        $sql = "SELECT f.ID as FID, l.*, concat(l.num, ' - ',l.name) as dispName, 
                        concat('/images/',l.LISTID,'/',l.num,'.jpg') as imageName, f.SONGID FROM favorites f 
                left join song_list l ON l.ID=f.SONGID
                where f.groupId={$_SESSION['userId']}                                                                        
                ORDER BY FID";
        $list = Info::get('db')->select($sql);
        return json_encode($list);
    }


    private static function get_favorites_with_text()
    {
        $sql = "SELECT f.ID as FID, l.*, concat(l.num, ' - ',l.name) as dispName, 
                        concat('/images/',l.LISTID,'/',l.num,'.jpg') as imageName, f.SONGID, l.TEXT FROM favorites f 
                left join song_list l ON l.ID=f.SONGID
                where f.groupId={$_SESSION['userId']}                                                                        
                ORDER BY FID";
        $list = Info::get('db')->select($sql);
        return json_encode($list);
    }


    private static function get_piano_favorites()
    {
        $sql = "SELECT f.ID as FID, l.*, concat(l.num, ' - ',l.name) as dispName, 
                        concat('/images/',l.LISTID,'/',l.num,'.jpg') as imageName, f.SONGID FROM piano_favorites f 
                left join song_list l ON l.ID=f.SONGID
                where f.groupId={$_SESSION['userId']}                                                                  
                ORDER BY FID";
        $list = Info::get('db')->select($sql);
        return json_encode($list);
    }

    private static function clear_favorites()
    {
        $sql = "DELETE FROM favorites WHERE groupId={$_SESSION['userId']}";
        Info::get('db')->exec($sql);
        return '';
    }

    private static function clear_piano_favorites()
    {
        $sql = "DELETE FROM piano_favorites WHERE groupId={$_SESSION['userId']}";
        Info::get('db')->exec($sql);
        return '';
    }

    private static function delete_favorite_item()
    {
        $sql = "DELETE FROM favorites WHERE ID=".self::$args['id'];
        Info::get('db')->exec($sql);
        return '';
    }


    private static function delete_piano_favorite_item()
    {
        $sql = "DELETE FROM piano_favorites WHERE ID=".self::$args['id'];
        Info::get('db')->exec($sql);
        return '';
    }


    private static function set_image()
    {
        Info::get('db')->exec("insert into current (groupId, image) values ({$_SESSION['userId']}, '/images/".
            mysqli_escape_string(Info::get('dbh'), self::$args['list_id'])."/".
            mysqli_escape_string(Info::get('dbh'), self::$args['image_num']).".jpg')");
        return '';
    }

    private static function get_image()
    {
        $img = Info::get('db')->select("select image, text from current where groupId=".$_SESSION['userId']);
        return json_encode($img);
    }

    private static function get_whole_text()
    {
        $songId = mysqli_escape_string(Info::get('dbh'), self::$args['id']);
        $txt = Info::get('db')->select("select TEXT from song_list where ID={$songId}");
        return json_encode($txt[0]);
    }

    private static function set_tech_image()
    {
        $image_name = self::$args['image_name'];
        Info::get('db')->exec("delete from current where groupId=".$_SESSION['userId']);
        Info::get('db')->exec("insert into current (groupId, image) 
                                values ({$_SESSION['userId']}, \"{$image_name}\")");
        return '';
    }

    private static function set_text()
    {
        $text = mysqli_escape_string(Info::get('dbh'), self::$args['text']);
        $image_name = self::$args['image_name'];
        Info::get('db')->exec("update current set text=\"{$text}\" WHERE groupId={$_SESSION['userId']} and image=\"{$image_name}\"");
        return '';
    }


    private static function clear_image()
    {
        Info::get('db')->exec("delete from current where groupId=".$_SESSION['userId']);
        return '';
    }


    /**
     * AJAX ENGINE
     */
    public static function execute($cmd)
    {
        $command = $cmd['command'];
        if( !isset($_SESSION['userId']) ){
            return json_encode(array('status'=>false, 'message'=>'User not logged in!'));
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