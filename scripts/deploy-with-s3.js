#!/usr/bin/env node
'use strict'

/**
 * Build gatsby site and deploy public/ to s3.
 *
 * The S3 path of the deployment depends on the HEROKU_APP_NAME variable,
 * which is passed to PRs by heroku, but you can set locally too.
 *
 * With HEROKU_APP_NAME: /dvc-org-pulls/$HEROKU_APP_NAME
 * Without HEROKU_APP_NAME: /dvc-org-prod
 *
 * Needs following environment variables:
 *
 *  - S3_BUCKET: name of the bucket
 *  - AWS_REGION: region of the bucket
 *  - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY: auth token to access the bucket.
 *  - HEROKU_APP_NAME: (optional) app name to specify the ID of the PR if any.
 **/

const path = require('path')
const { execSync } = require('child_process')
const { remove, move, ensureDir } = require('fs-extra')
const { s3Prefix, s3Bucket, s3Client } = require('./s3-utils')

const rootDir = path.join(__dirname, '..')
const cacheDirName = '.cache'
const publicDirName = 'public'

function localPath(dirName) {
  return path.join(rootDir, dirName)
}

function run(command) {
  execSync(command, {
    stdio: ['pipe', process.stdout, process.stderr]
  })
}

function syncCall(method, ...args) {
  return new Promise((resolve, reject) => {
    const synchroniser = s3Client[method](...args)
    synchroniser.on('error', reject)
    synchroniser.on('end', resolve)
  })
}

async function prefixIsEmpty(prefix) {
  try {
    await s3Client.s3
      .headObject({
        Bucket: s3Bucket,
        Prefix: `${prefix}/${publicDirName}/index.html`
      })
      .promise()
    return false
  } catch (e) {
    return true
  }
}

async function downloadFromS3(prefix, dir) {
  try {
    const localDirPath = localPath(dir)
    const staticPrefix = prefix + '/' + dir
    await ensureDir(localDirPath)

    console.time(`downloading "${dir}" from s3://${s3Bucket}/${staticPrefix}`)
    await syncCall('downloadDir', {
      localDir: localDirPath,
      s3Params: {
        Bucket: s3Bucket,
        Prefix: staticPrefix
      }
    })
    console.timeEnd(
      `downloading "${dir}" from s3://${s3Bucket}/${staticPrefix}`
    )
  } catch (downloadError) {
    console.error('Error downloading initial data', downloadError)
    // Don't propagate. It's just a cache warming step
  }
}

async function downloadAllFromS3(prefix) {
  await downloadFromS3(prefix, publicDirName)
  await downloadFromS3(prefix, cacheDirName)
}

async function uploadToS3(dir) {
  console.log(`Uploading public/ to s3://${s3Bucket}/${s3Prefix}`)
  console.time(`upload to s3 "${dir}" directory`)
  await syncCall('uploadDir', {
    localDir: localPath(dir),
    deleteRemoved: true,
    s3Params: {
      Bucket: s3Bucket,
      Prefix: s3Prefix
    }
  })
  console.timeEnd(`upload to s3 "${dir}" directory`)
}

async function uploadAllToS3() {
  await uploadToS3(publicDirName)
  await uploadToS3(cacheDirName)
}

async function clean() {
  await remove(localPath(cacheDirName))
  await remove(localPath(cacheDirName))
}

async function main() {
  const emptyPrefix = await prefixIsEmpty(s3Prefix)

  // First build of a PR is slow because it can't reuse cache.
  // But we can download from prod to warm cache up.
  const cacheWarmPrefix = emptyPrefix ? 'dvc-org-prod' : s3Prefix

  await downloadAllFromS3(cacheWarmPrefix)

  try {
    run('yarn build')
  } catch (buildError) {
    // Sometimes gatsby build fails because of bad cache.
    // Clear it and try again.

    console.error('------------------------\n\n')
    console.error(buildError)
    console.error('\nAssuming bad cache and retrying:\n')

    await clean()
    run('yarn build')
  }

  await move(
    path.join(localPath(publicDirName), '404.html'),
    path.join(rootDir, '404.html'),
    {
      overwrite: true
    }
  )
  await uploadAllToS3()
  await clean()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
