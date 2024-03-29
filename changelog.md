# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unknown]

### Changed
* Raised minimum NodeJS version to `>=18.0.0`.

## [2.0.1] - 2022-03-16

## [2.0.0] - 2021-07-10

### Changed
* This package now ships ESM.
* API surface has been simplified, and runtime type assertions removed in favour of static checks offered by TypeScript.

## [1.0.0] - 2021-07-10

### Changed
* Raised minimum NodeJS version to `^12.17.0 || >=14.0.0`.

## [1.0.0-rc.0] - 2021-04-18

### Added
* TypeScript definitions.

### Fixed
* File system errors during deletion being reported while other deletions are still in progress, causing the process to appear to "hang" after errors.<br/>
  This issue is typically encountered if a file is removed by something else while unseen files are being deleted.

### Changed
* Only forward slashes supported in filter expressions. [globby@10.0.0](https://github.com/sindresorhus/globby/releases/tag/v10.0.0)→[fast-glob@3.0.0](https://github.com/mrmlnc/fast-glob/releases/tag/3.0.0)
* Filter expressions are now passed to fast-glob (through globby) instead of the former node-glob (which use minimatch). Compatibility is high, however there may be some inconsistencies. [globby@8.0.0](https://github.com/sindresorhus/globby/releases/tag/v8.0.0)
* Increased minimum NodeJS version from 6 to 10.

## [0.2.0] - 2016-06-19

### Fixed
* Fix for extension regex.

## [0.1.2] - 2016-06-19

Fixed bad release.

## [0.1.1] - 2016-06-19

Added more package metadata.

## [0.1.0] - 2016-06-18

Initial release.

[Unreleased]: https://github.com/userfrosting/gulp-prune/compare/v2.0.0...HEAD
[1.0.0]: https://github.com/userfrosting/gulp-prune/releases/tag/v2.0.0
[1.0.0]: https://github.com/userfrosting/gulp-prune/releases/tag/v1.0.0
[1.0.0-rc.0]: https://github.com/userfrosting/gulp-prune/releases/tag/v1.0.0-rc.0
[0.2.0]: https://github.com/userfrosting/gulp-prune/releases/tag/v0.2.0
[0.1.2]: https://github.com/userfrosting/gulp-prune/releases/tag/v0.1.2
[0.1.1]: https://github.com/userfrosting/gulp-prune/releases/tag/v0.1.1
[0.1.0]: https://github.com/userfrosting/gulp-prune/releases/tag/v0.1.0
