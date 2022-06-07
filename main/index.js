const express        = require('express'),
      cookieParser   = require('cookie-parser'),
      srvLessExpress = require('@vendia/serverless-express')
      path           = require('path'),
      app            = express()

const SERVER_PORT = process.env.PORT || 4000;

const router = require('./router')

app.set('views', path.join(__dirname, './views'));
app.set('view engine', 'ejs');

app.use(cookieParser())
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, './public')));
app.use(router());

app.listen(SERVER_PORT, () => console.log(`Server is listening on port ${SERVER_PORT}!`));

const cachedSrvLessExpress = srvLessExpress({ app })

module.exports = async function (context, req) {
  return cachedSrvLessExpress(context, req)
}
