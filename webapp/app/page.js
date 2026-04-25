import SpaceGame from "./space-game";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <SpaceGame />
    </main>
  );
}
