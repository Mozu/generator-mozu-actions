# Mozu Extension generator

Maintainer: [James Zetlen](https://github.com/zetlen)

A Mozu Extension generator for Yeoman that provides boilerplate and structure for writing Mozu Custom Functions against the family of Mozu Extension Actions. It provides documented function stubs, a build process using Grunt and Browserify, remote sync with the Developer Center, and unit tests using Nodeunit or Mocha plus the Mozu Extension Simulator.

## This package is currently a prerelease.
**This contains pre-release code. It may have behaviors or rely on features that don't work in Mozu production environments. Use with caution!**

![](http://i.imgur.com/01FRhEd.png)

## Usage

First, install [Yeoman](http://yeoman.io)'s command line tool if you haven't already!

```bash
npm install -g yo
```

Yeoman looks for globally installed NPM packages that identify themselves as Yeoman generators. So install the generator globally.

```bash
npm install -g generator-mozu-extension
```

Make a new directory and `cd` into it:
```
mkdir new-mozu-ext && cd new-mozu-ext
```

Run `yo mozu-extension`:
```
yo mozu-extension
```

## Options

* `--skip-install`
  
  Skips the automatic execution of `npm install` after scaffolding has finished.

* `--skip-prompts`

  Often you may find yourself rerunning the generator in the same directory. Your answers to prompts are saved; if you want to quickly re-run the generator without prompts, use this option. Will not work if you've never run the generator in this directory before.

* `--quick`
  
  Equivalent to `--skip-install --skip-prompts`.

* `--internal`

  Allows integration with non-production Mozu environments. The prompts will include an extra question about which environment to sync with.


## Creating Additional Actions

The generator uses a Yeoman sub-generator to create the action implementation scaffolds and unit test scaffolds. You can call this sub-generator directly, after creating your project, to add more scaffolding for additional actions:

```
yo mozu-extension:action
```

This will prompt you to add to your list of actions, and then will write the additional action scaffolds.