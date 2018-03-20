# Coexhub API

**Warning:** This API is in alpha state and may change without notice. 

## Authentication
Authentication is done using `X-Token` header.

`X-Token: 1234567890abcdef1234567890abcdef`

## Root endpoint
`https://hub.copterexpress.com/api`

## Endpoints
### Get list of available drones
`GET /drones/list`

### Get drone state
`GET /drones/:drone_id/state`

### Get drone state history
`GET /drones/:drone_id/states`

### Send a command to drone
`POST /drones/:drone_id/command`

#### Parameters
| Name      | Type     | Description                             |
|-----------|----------|-----------------------------------------|
| `command` | `string` | **Required.** Command name              |
| `params`  | `string` | **Optional.** Command parameters (JSON) |

#### Commands
| Name          | Description                                |
|---------------|--------------------------------------------|
| `run_mission` | Run mission provided in `params`           |
| `pause`       | Pause flight and hover at current position |
| `resume`      | Resume flight                              |
| `rtl`         | Abort mission and return to launch         |

#### Mission description
| Name           | Type                 | Description                                                                                                                                                               |
|----------------|----------------------|-----------------------------------------------------------------------------|
| `type`         | `string`             | **Required.** Mission type. Supported types are `Monitoring` and `Delivery` |
| `locations`    | `array` of `object`s | **Required.** List of mission waypoints                                     |
| `altitude`     | `number`             | **Required.** Flight altitude relative to initial takeoff location          |
| `name`         | `string`             | **Optional.** Mission name                                                  |
| `flight_speed` | `number`             | **Optional.** Horizontal flight speed in meters per second                  |
| `post_report`  | `boolean`            | **Optional.** If `true`, mission report will be created at mission start and updated when mission ends or being aborted. Not implemented yet for `Delivery` type missions |

#### Waypoint description
| Name              | Type      | Description                                                                                                                                            |
|-------------------|-----------|-------------------------------------------------------------------------------------|
| `lat`             | `number`  | **Required.** Latitude in deg                                                       |
| `lon`             | `number`  | **Required.** Longitude in deg                                                      |
| `altitude_offset` | `number`  | **Optional.** Altitude offset in m/s relative to initial takeoff location           |
| `release_cargo`   | `boolean` | **Optional.** If `true`, vehicle will descend, land, disarm, release cargo and take off in this location. Has no effect for `Monitoring` type missions |

#### Sample `run_mission` params
```json
{
    "type": "Delivery",
    "locations": [
        {
            "lat": 55.7048401,
            "lon": 37.7220828,
            "release_cargo": false
        },
        {
            "lat": 55.70492414980209,
            "lon": 37.72201726655891,
            "altitude_offset": 5,
            "release_cargo": true
        }
    ],
    "altitude": 32,
    "name": "Test flight",
    "flight_speed": 5,
    "post_report": true,
    "info": "It's ok to add some field to params to identify the mission as running mission's params are returned in each drone's state",
    "e.g. id": "c72b10d9c84f8850296d10e4de168f3c"
}
```

### Get drone's server storage
`GET /drones/:drone_id/storage`

### Replace stored info
`PUT /drones/:drone_id/storage`

### Patch stored JSON
`PATCH /drones/:drone_id/storage`

### Get drone's photo list
`GET /drones/:drone_id/photos`

### Delete drone's photo
`DELETE /drones/:drone_id/photos`

### Download photos in zip archive
`GET /drones/:drone_id/photos/download`

### Get list of drone's flight reports
`GET /drones/:drone_id/reports`

### Get drone's flight report
`GET /drones/:drone_id/reports/:report_id`
