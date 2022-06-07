# What 

Azure Function HTTPS Proxy to Azure Blob Storage, with AAD OAuth

# Why 

OAuth protected static web site with ~no infra cost, and ~no 3rd party js lib;
Using : 

- Standard HTTP redirect OAuth flow 
- Shared Access Secret ${HTTP request to Blob Storage}.pipe(res)

We could have used native Az Function AAD IdP but that would not have been "portable", and would be missing the /root welcome URL

# How: 

## Run locally 

	git clone
	az login 
	az account set --subscription ${AZ_TENANT_ID} 
	az account show
	#az webapp up -sku F1 # Adapt .azure/config with desired Location, RSG, etc ...
	#<- Not a function, but a long lived/billed container : Don't
	$env:APP_SETTINGS = "$(jq -rc '.APP_SETTINGS' .\APP_SETTINGS.json)"
	func start

## Run on Az

### Create Az pre req resources 

	az login 
	az account set -s ${AZ_TENANT_ID}
	az account show
	az group create --name CTGFRNPDRSG-staticsServ --location francecentral --tags owner=me.mySelf.I
	az storage account create --name ctgfrnpdstaticsserv --location francecentral --resource-group CTGFRNPDRSG-staticsServ --sku Standard_LRS 

Create the Registered App CTGFRNPD_staticsserv :

- portal.Az > AAD > App registrations > New registration > 
- Check the toggle "Accounts in this organizational directory only"
- Add the appropriate "Redirect URIs" (Ex: http://localhost:4000/postJwt + https://staticsserv.azurewebsites.net/postJwt)
- Once registered: Athentification > Check the toggle "ID tokens (used for implicit and hybrid flows)"

### Create Az Function  

	az functionapp plan create --location francecentral --name CTGFRNPDAPL-staticsServ --number-of-workers 1 --resource-group CTGFRNPDRSG-staticsServ --sku B1 --is-linux true
	az functionapp create --name staticsServ --storage-account ctgfrnpdstaticsserv --plan CTGFRNPDAPL-staticsServ --resource-group CTGFRNPDRSG-staticsServ --functions-version 4 --os-type Linux --runtime node --runtime-version 16 #--disable-app-insights
	az functionapp update -n staticsServ -g CTGFRNPDRSG-staticsServ --set 'httpsOnly=true'

### Conf and secrets for Az Function 

Update APP_SETTINGS.json with appropriate values 
The azure.blob.sas value should be generated using CLI or portal with the following permissions : 

- Allowed services : Blob (ss=b)
- Allowed resource types : Service, Container, Object (srt=sco)
- Allowed permissions : Read, List (sp=rl)
- Allowed protocols : HTTPS Only 

	az functionapp config appsettings set -n staticsServ -g CTGFRNPDRSG-staticsServ --settings '@APP_SETTINGS.json'

### Publish to Az 

	func azure functionapp publish staticsServ
	func azure functionapp logstream staticsServ

### Setup CD

portal.Az > Function App > staticsServ > Deployment Center

## Misc 

	az functionapp config appsettings set -n staticsServ -g CTGFRNPDRSG-staticsServ --settings '@APP_SETTINGS.json'
	az functionapp config appsettings list -n staticsServ -g CTGFRNPDRSG-staticsServ 
	az functionapp config appsettings delete -n staticsServ -g CTGFRNPDRSG-staticsServ --setting-names APP_SETTINGS


	$env:APP_SETTINGS = "$(jq -rc '.APP_SETTINGS' .\APP_SETTINGS.json)"
	dir Env:\APP_SETTINGS                   
	Remove-Item Env:\APP_SETTINGS

## New Az Function from scratch  

	func init staticsServ --javascript
	cd staticsServ
	func new --name main --template "HTTP trigger" --authlevel "anonymous"

