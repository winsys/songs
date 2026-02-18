<?php

class App
{

    /**
     * APP START
     */
    public function run()
    {
        if (isset($_REQUEST['route'])){
            $route = explode('/', $_REQUEST['route']);
        }else{
            $route = array();
        }
        $this->selectRoute($route);
    }


    /**
     * ROUTER
     */
    private function selectRoute($route)
    {
        if (count($route) == 0) {
            if( !Security::isLoggedIn() ){
                header("Location: /login");
            } else {
                header("Location: /index/".$_SESSION['userId']);
            }
            exit;
        }

        if ($route[0] == 'logout') {
            Security::doLogout();
            header("Location: /login");
            exit;
        }

        if( !Security::isLoggedIn() )
        {
            if( Security::loginRequest() ) {
                if (Security::doLogin()) {
                    if (Security::isLoggedIn()) {
                        header("Location: /index/".$_SESSION['userId']);
                        exit;
                    }
                }
            }
            $this->render('login');
            exit;
        }

        switch ($route[0]) {
            case 'ajax':
                // Handle file uploads differently (uses $_POST instead of php://input)
                if (!empty($_FILES)) {
                    $cmds = $_POST;
                } else {
                    $cmds = json_decode(file_get_contents('php://input'), true);
                }
                echo Ajax::execute($cmds);
                break;
            case 'text':
                $this->render($route[0], $route[1], 'text_layout');
                break;
            case 'text_stream':
                $this->render($route[0], $route[1], 'text_layout_streaming');
                break;
            default:
                $this->render($route[0], $route[1]);
                break;
        }
    }

    /**
     * RENDERER
     */
    private function render($view, $param = null, $layout = null)
    {
        $userId = $param;
        $viewFile = '../templates/'.$view.'.html';
        if (is_readable($viewFile))
        {
            ob_start();
            include $viewFile;
            $pageContent = ob_get_contents();
            ob_end_clean();
        }else{
            $pageContent = 'no content';
        }

        $layoutFile = is_null($layout) ? '../templates/layout.html' : '../templates/'.$layout.'.html';

        ob_start();
        include $layoutFile;
        $html = ob_get_contents();
        ob_end_clean();

        echo $html;
    }

}