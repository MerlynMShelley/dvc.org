import React from 'react'
import Link from '../../../Link'
import useStars from '../../../../gatsby/hooks/stars'

import styles from './styles.module.css'

const GithubLine: React.FC = () => {
  const stars = useStars()

  return (
    <div className={styles.container}>
      <img className={styles.githubLogo} src="/img/github_small.png" alt="" />
      We’re on
      <Link href="https://github.com/iterative/dvc" className={styles.link}>
        GitHub
      </Link>
      <img className={styles.starIcon} src="/img/star_small.svg" alt="" />
      <span className={styles.count}>{stars || '---'}</span>
    </div>
  )
}

export default GithubLine
