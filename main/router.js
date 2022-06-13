const express    = require('express'),
      https      = require('https'),
      url        = require('url'),
      jwt        = require('jsonwebtoken'),
      jwksClient = require('jwks-rsa')

// WTH MS and this non JSON format
const appSettings = JSON.parse(process.env.APP_SETTINGS?.replace(/'/g, '"') || '{}')

module.exports = () => {

  const router = express.Router();

  async function listContainers() {

    return new Promise((resolv, reject) => {

      console.log(`https://${appSettings.azure.blob.storageAccount}${appSettings.azure.blob.endpoint}/?comp=list&${appSettings.azure.blob.sas}`)
      https.get(`https://${appSettings.azure.blob.storageAccount}${appSettings.azure.blob.endpoint}/?comp=list&${appSettings.azure.blob.sas}`, (res) => {

        const body = []

        res.on('data', (chunck) => {
          body.push(chunck)
        })

        res.on('end', () => {

          const matches    = body.join('').matchAll(/<Name>([\w-]+)<\/Name>/g),
                containers = []

          for (const match of matches) {
            containers.push(match[1])
          }

          resolv(containers.filter(i => i.slice(0, 14) != 'azure-webjobs-'))
        })

      }).on('error', (err) => {
        console.error(err)
        reject(err)
      })
    })
  }

  async function getBlobPage(req, res, next) {

    let assetName = req.path.slice(1)

    assetName = (assetName == '') ? 'index.html' : assetName
    assetName = (assetName.slice(-1).includes('/')) ? assetName + 'index.html' : assetName
    assetName = (assetName.includes('.')) ? assetName : assetName + '/index.html'

    res.contentType(assetName.split('/').slice(-1)[0])

    https.get(`https://${appSettings.azure.blob.storageAccount}${appSettings.azure.blob.endpoint}/${assetName}?${appSettings.azure.blob.sas}`, (blobRes) => {
      //res.contentType(assetName.split('/').slice(-1)[0])
      res.set('Cache-control', 'public, max-age=300')
      res.status(blobRes.statusCode)
      blobRes.pipe(res)
    })
  }

  function getSigningKeys(header, cb) {

    if (appSettings.signingKey)
      return cb(null, appSettings.signingKey)

    const client = jwksClient({
      jwksUri: `https://${appSettings.azure.aad.loginEndPoint}/${appSettings.azure.aad.tenantId}/discovery/v2.0/keys`
    });

    client.getSigningKey(header.kid, function (err, key) {
        if (!err)
          appSettings.signingKey = key?.publicKey || key?.rsaPublicKey
        cb(err, appSettings.signingKey)
    });
  }

  function validateJwt(req, res, next) {

    const token = req.cookies.jwt

    if (token) {
        
        const validationOptions = {
          audience: appSettings.azure.app.clientId,
          issuer: `https://${appSettings.azure.aad.loginEndPoint}/` + appSettings.azure.aad.tenantId + '/v2.0'
        }

        jwt.verify(token, getSigningKeys, validationOptions, (err, payload) => {
          if (err) {
            console.log(err)
            res.status(403).redirect('/')
          }

          next()
        })
    } else {

      const scheme = (req.hostname == 'localhost') ? 'http' : 'https'

      const authorizeUrl = [
        `https://${appSettings.azure.aad.loginEndPoint}/`,
        appSettings.azure.aad.tenantId,
        '/oauth2/v2.0/authorize',
        '?client_id=' + appSettings.azure.app.clientId,
        '&scope=' + encodeURIComponent('user.read openid profile offline_access'),
        '&redirect_uri=' + encodeURIComponent(`${scheme}://${req.get('host')}/postJwt`),
        '&response_mode=form_post',
        '&response_type=id_token',
        '&nonce=' + Math.floor(Math.random() * 10_000_000_000_000),
        '&state=' + url.parse(req.originalUrl).pathname
      ].join('')
      res.redirect(authorizeUrl)
    }
  }

  router.post('/postJwt', (req, res) => {

    req.cookies.jwt = req.body.id_token
    validateJwt(req, res, () => {
      res.cookie('jwt', req.cookies.jwt, { maxAge: 60 * 60000, secure: true, httpOnly: true, sameSite: 'Lax' }) // signed: true
      res.redirect(req.body.state || '/')
    })
  })

  async function genContainersRoutes() {

    const containers = await listContainers()

    containers.forEach((container) => {
      router.get([`/${container}`, `/${container}/`, `/${container}/*`], validateJwt, getBlobPage)
    })
  }

  (async () => { await genContainersRoutes() })()

  router.get('/signout', (req, res) => {
    res.clearCookie('jwt')
    const scheme = (req.hostname == 'localhost') ? 'http' : 'https'
    res.redirect(`https://${appSettings.azure.aad.loginEndPoint}/${appSettings.azure.aad.tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${scheme}://${req.get('host')}/`)
  })

  router.get('/', async (req, res, next) => {

    const token = req.cookies.jwt

    const validationOptions = {
      audience: appSettings.azure.app.clientId,
      issuer: `https://${appSettings.azure.aad.loginEndPoint}/${appSettings.azure.aad.tenantId}/v2.0`
    }

    jwt.verify(token, getSigningKeys, validationOptions, async (err, payload) => {
      res.render('home', { containers: (!err) ? await listContainers() : [], isAuthenticated: (!err) });
    })    
  })

  router.get('/signin', validateJwt, async (req, res, next) => {
    res.render('home', { containers: (req.cookies.jwt) ? await listContainers() : [], isAuthenticated: req.cookies.jwt });
  })

  return router;
}