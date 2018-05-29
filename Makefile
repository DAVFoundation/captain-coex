FORCE:

rebuild: FORCE
	@rsync -a ../dav-js build
	@rm -rf ../dav-js/node_modules
	@docker-compose build --no-cache

build: FORCE
	@docker-compose build

up: build
	@docker-compose up

create-aws-stg-env:
	@eb init captain-coex
	@eb create captain-coex-stg --cname captain-coex-stg -k captain-coex-key

deploy-aws-stg-env: rebuild
	@eb deploy --profile eb-cli-dav --staged

