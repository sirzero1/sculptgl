SculptGL - WebGL sculpting
==========================

You can try it [**here**](http://stephaneginier.com/sculptgl).

Additional information can be found on the [website](http://stephaneginier.com/).

Tools
=====

#### Dev

Nothing to do.
Simply open `index.html`.

#### Release

If it's not already done, install [nodejs](http://nodejs.org/).
Then use grunt :

    git clone git://github.com/stephomi/sculptgl.git
    cd sculptgl
    npm install -g grunt-cli # if not already done
    npm install

    grunt build # web version
    grunt standalone # desktop webkit version
