<?php

error_reporting(E_ALL);

include '../app/Info.php';
include "../app/Database.php";
include "../app/Ajax.php";
include "../app/App.php";

session_start();

Info::set('config', include '../app/config.php');

$database = new Database();
Info::set('db', $database);
Info::set('dbh', $database->db_handle());

$app = new App();

$app->run();
