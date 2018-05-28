FORCE:

build: FORCE
	@rsync -a ../dav-js build
	@rm -rf ../dav-js/node_modules
	@docker-compose build --no-cache

up: build
	@docker-compose up

create-aws-stg-env:
	@eb init captain-coex
	@eb create captain-coex-stg --cname captain-coex-stg -k captain-coex-key

deploy-aws-stg-env:
	@eb deploy --profile eb-cli-dav --staged

