# Ajax.php Refactoring Guide

The Ajax.php file has been split into multiple trait files for better organization.

## File Structure

```
app/
├── Ajax.php (main class - uses all traits)
├── Ajax_Common.php ✓ (created - common functions used across pages)
├── Ajax_Tech.php (tech page functions)
├── Ajax_Sermon.php (sermon page functions)
├── Ajax_Settings.php (settings page functions)
├── Ajax_Import.php (import page functions)
```

## Function Distribution

### Ajax_Common.php ✓ CREATED
- checkMime()
- get_song_list()
- add_to_favorites()
- add_to_piano_favorites()
- get_favorites()
- get_favorites_with_text()
- get_piano_favorites()
- clear_favorites()
- clear_piano_favorites()
- delete_favorite_item()
- delete_piano_favorite_item()
- set_image()
- get_image()
- get_whole_text()
- clear_image()
- update_song()
- create_song()
- upload_song_image()
- updateSocket()
- get_all_song_lists()
- get_user_settings()
- get_languages()

### Ajax_Tech.php (TO CREATE)
- set_tech_image()
- set_text()
- get_bible_translations()
- get_bible_books()
- get_bible_chapters()
- get_bible_verses()
- search_bible_verses()
- set_bible_text()
- search_messages()
- get_message()
- set_message_text()
- add_media_to_favorites()
- delete_media_favorite()
- upload_media_image()
- upload_media_video()
- set_video()
- video_control()

### Ajax_Sermon.php (TO CREATE)
- get_sermon_list()
- get_sermon()
- save_sermon()
- delete_sermon()
- upload_sermon_image()
- upload_sermon_video()
- save_sermon_notes_settings()

### Ajax_Settings.php (TO CREATE)
- save_user_settings()
- get_group_users()
- update_group_user()
- create_group_user()
- upload_placeholder_image()

### Ajax_Import.php (TO CREATE)
- create_song_list()
- import_songs_sog()
- import_song_images_zip()
- import_messages_sog()
- import_messages_text()
- search_messages_by_code()
- add_language()
- delete_language()

## Updated Ajax.php Structure

```php
<?php

class Ajax
{
    // Include all trait files
    use Ajax_Common;
    use Ajax_Tech;
    use Ajax_Sermon;
    use Ajax_Settings;
    use Ajax_Import;

    private static $args;

    public static function execute($cmd)
    {
        $command = $cmd['command'];
        if( !isset($_SESSION['curGroupId']) ){
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
```

## Benefits

1. **Better Organization**: Each file contains related functionality
2. **Easier Maintenance**: Find and update functions more easily
3. **Team Collaboration**: Multiple developers can work on different files
4. **Clear Responsibilities**: Each trait has a specific purpose
5. **Reduced File Size**: Smaller, more manageable files

## Next Steps

1. Create remaining trait files (Ajax_Tech, Ajax_Sermon, Ajax_Settings, Ajax_Import)
2. Update Ajax.php to use all traits
3. Test all Ajax calls to ensure they still work
4. Remove old Ajax.php after verification
