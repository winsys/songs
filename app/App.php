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
        if (count($route) == 0){
            header("Location: /index");
            exit;
        }
        switch ($route[0]) {
            case 'ajax':
                $cmds = json_decode(file_get_contents('php://input'), true);
                echo Ajax::execute($cmds);
                break;
            default:
                // render action
                $this->render($route[0]);
        }
    }

    /**
     * RENDERER
     */
    private function render($view, $param = null)
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

        $layoutFile = '../templates/layout.html';

        ob_start();
        include $layoutFile;
        $html = ob_get_contents();
        ob_end_clean();

        echo $html;
    }

}