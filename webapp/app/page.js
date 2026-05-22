import SpaceGame from "./space-game";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <SpaceGame />
      <a
        className={styles.projectLink}
        href="https://www.eridutechnologies.com/projects/ai-learns-to-play-spaceship"
        target="_blank"
        rel="noreferrer"
      >
        AI Learns to play spaceship blog
      </a>
    </main>
  );
}
